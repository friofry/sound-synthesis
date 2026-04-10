/*
 * Harmonic product spectrum (HPS) pitch helpers — mirrors src/components/FrequencyAnalyzer/pitchAnalysis.ts
 * Max bins must stay in sync with PITCH_ANALYSIS_WASM_MAX_BINS in pitchAnalysisWasm.ts
 * No libc / no wasm imports (same spirit as sim_hotloop.c).
 */
#include <stddef.h>
#include <stdint.h>

#if defined(__wasm_simd128__)
#include <wasm_simd128.h>
#endif

#define HPS_HARMONICS 5
#define MAX_BINS 16384

/* 16-byte alignment enables v128 loads/stores on the SIMD wasm build. */
#if defined(__wasm_simd128__)
#define PITCH_MEM_ATTR __attribute__((aligned(16)))
#else
#define PITCH_MEM_ATTR
#endif

static PITCH_MEM_ATTR double s_mag[MAX_BINS];
static PITCH_MEM_ATTR double s_hps[MAX_BINS];

static inline double nan_d(void) {
  union {
    uint64_t u;
    double d;
  } x;
  x.u = 0x7ff8000000000000ULL;
  return x.d;
}

static inline int is_finite_f64(double x) {
  return (x == x) && (x <= 1.7976931348623157e308) && (x >= -1.7976931348623157e308);
}

static inline int is_finite_f32(float x) {
  return (x == x) && (x <= 3.402823466e38F) && (x >= -3.402823466e38F);
}

static inline double fabs_d(double x) {
  return x < 0.0 ? -x : x;
}

static inline double fmax_d(double a, double b) {
  return a > b ? a : b;
}

/* exp(x) without libm — covers db_to_linear (x in about [-14, 0]) */
static double exp_impl(double x) {
  if (x > 709.0) {
    return 1.7976931348623157e308;
  }
  if (x < -745.0) {
    return 0.0;
  }
  if (x == 0.0) {
    return 1.0;
  }
  if (x > 0.5) {
    double h = exp_impl(x * 0.5);
    return h * h;
  }
  if (x < -0.5) {
    return 1.0 / exp_impl(-x);
  }
  /* |x| <= 0.5 */
  {
    double t = x;
    double s = 1.0 + x;
    int i;
    for (i = 2; i <= 22; i += 1) {
      t *= x / (double)i;
      s += t;
    }
    return s;
  }
}

static inline double clamp_d(double v, double lo, double hi) {
  if (v < lo) {
    return lo;
  }
  if (v > hi) {
    return hi;
  }
  return v;
}

static inline double f64_at(uint32_t byte_offset) {
  return *(double *)(uintptr_t)byte_offset;
}

static inline float f32_at(uint32_t byte_offset) {
  return *(float *)(uintptr_t)byte_offset;
}

static double parabolic_peak_offset(double y_prev, double y_peak, double y_next) {
  double denom = y_prev - 2.0 * y_peak + y_next;
  if (!is_finite_f64(denom) || fabs_d(denom) < 1e-18) {
    return 0.0;
  }
  return clamp_d(0.5 * (y_prev - y_next) / denom, -1.0, 1.0);
}

/* 10^(db/20) */
static double db_to_linear(double db) {
  const double ln10 = 2.30258509299404568402;
  return fmax_d(0.0, exp_impl((db * 0.05) * ln10));
}

static double floor_nonneg(double x) {
  if (!(x > 0.0)) {
    return 0.0;
  }
  if (x >= 9007199254740992.0) {
    return x;
  }
  return (double)(uint64_t)x;
}

static double ceil_nonneg(double x) {
  double fl = floor_nonneg(x);
  return fl < x ? fl + 1.0 : fl;
}

static void harmonic_product_spectrum(uint32_t n) {
  uint32_t i;
#if defined(__wasm_simd128__)
  i = 0;
  for (; i + 2u <= n; i += 2u) {
    wasm_v128_store(&s_hps[i], wasm_v128_load(&s_mag[i]));
  }
  for (; i < n; i += 1) {
    s_hps[i] = s_mag[i];
  }
#else
  i = 0;
  for (; i + 4u <= n; i += 4u) {
    s_hps[i] = s_mag[i];
    s_hps[i + 1u] = s_mag[i + 1u];
    s_hps[i + 2u] = s_mag[i + 2u];
    s_hps[i + 3u] = s_mag[i + 3u];
  }
  for (; i < n; i += 1) {
    s_hps[i] = s_mag[i];
  }
#endif
  int h;
  for (h = 2; h <= HPS_HARMONICS; h += 1) {
    uint32_t limit = (uint32_t)(n / (uint32_t)h);
    i = 0;
    for (; i + 4u <= limit; i += 4u) {
      s_hps[i] *= s_mag[i * (uint32_t)h];
      s_hps[i + 1u] *= s_mag[(i + 1u) * (uint32_t)h];
      s_hps[i + 2u] *= s_mag[(i + 2u) * (uint32_t)h];
      s_hps[i + 3u] *= s_mag[(i + 3u) * (uint32_t)h];
    }
    for (; i < limit; i += 1) {
      s_hps[i] *= s_mag[i * (uint32_t)h];
    }
    i = limit;
    for (; i + 4u <= n; i += 4u) {
      s_hps[i] = 0.0;
      s_hps[i + 1u] = 0.0;
      s_hps[i + 2u] = 0.0;
      s_hps[i + 3u] = 0.0;
    }
    for (; i < n; i += 1) {
      s_hps[i] = 0.0;
    }
  }
}

double find_dominant_decibels(uint32_t data_off, uint32_t bin_count, double sample_rate, double min_hz, double max_hz) {
  uint32_t i;
  if (bin_count < 3u || bin_count > MAX_BINS || sample_rate <= 0.0) {
    return nan_d();
  }
  const double min_db = -120.0;
  const double nyquist = sample_rate * 0.5;

  i = 0;
  for (; i + 4u <= bin_count; i += 4u) {
    float db0 = f32_at(data_off + i * 4u);
    float db1 = f32_at(data_off + (i + 1u) * 4u);
    float db2 = f32_at(data_off + (i + 2u) * 4u);
    float db3 = f32_at(data_off + (i + 3u) * 4u);
    if (!is_finite_f32(db0)) {
      db0 = (float)min_db;
    }
    if (!is_finite_f32(db1)) {
      db1 = (float)min_db;
    }
    if (!is_finite_f32(db2)) {
      db2 = (float)min_db;
    }
    if (!is_finite_f32(db3)) {
      db3 = (float)min_db;
    }
    s_mag[i] = db_to_linear((double)db0);
    s_mag[i + 1u] = db_to_linear((double)db1);
    s_mag[i + 2u] = db_to_linear((double)db2);
    s_mag[i + 3u] = db_to_linear((double)db3);
  }
  for (; i < bin_count; i += 1) {
    float db = f32_at(data_off + i * 4u);
    if (!is_finite_f32(db)) {
      db = (float)min_db;
    }
    s_mag[i] = db_to_linear((double)db);
  }

  harmonic_product_spectrum(bin_count);

  int best_index = -1;
  double best_value = -1.0;
  for (i = 1; i < bin_count - 1; i += 1) {
    double hz = ((double)i / (double)bin_count) * nyquist;
    if (hz < min_hz || hz > max_hz) {
      continue;
    }
    if (s_hps[i] > best_value) {
      best_value = s_hps[i];
      best_index = (int)i;
    }
  }

  if (best_index < 0) {
    return nan_d();
  }
  if (best_index < 1 || (uint32_t)best_index >= bin_count - 1u) {
    return ((double)best_index / (double)bin_count) * nyquist;
  }

  double offset = parabolic_peak_offset(s_hps[(uint32_t)best_index - 1u], s_hps[(uint32_t)best_index], s_hps[(uint32_t)best_index + 1u]);
  double hz = (((double)best_index + offset) / (double)bin_count) * nyquist;
  if (is_finite_f64(hz) && hz >= min_hz && hz <= max_hz) {
    return hz;
  }
  return ((double)best_index / (double)bin_count) * nyquist;
}

double find_dominant_linear_mag(
    uint32_t mag_off,
    uint32_t bin_count,
    double sample_rate,
    double frame_size,
    double min_hz,
    double max_hz
) {
  uint32_t i;
  if (bin_count < 3u || bin_count > MAX_BINS || sample_rate <= 0.0 || frame_size <= 0.0) {
    return nan_d();
  }

  i = 0;
  for (; i + 4u <= bin_count; i += 4u) {
    double m0 = f64_at(mag_off + i * 8u);
    double m1 = f64_at(mag_off + (i + 1u) * 8u);
    double m2 = f64_at(mag_off + (i + 2u) * 8u);
    double m3 = f64_at(mag_off + (i + 3u) * 8u);
    s_mag[i] = is_finite_f64(m0) ? m0 : 0.0;
    s_mag[i + 1u] = is_finite_f64(m1) ? m1 : 0.0;
    s_mag[i + 2u] = is_finite_f64(m2) ? m2 : 0.0;
    s_mag[i + 3u] = is_finite_f64(m3) ? m3 : 0.0;
  }
  for (; i < bin_count; i += 1) {
    double m = f64_at(mag_off + i * 8u);
    s_mag[i] = is_finite_f64(m) ? m : 0.0;
  }

  harmonic_product_spectrum(bin_count);

  int best_index = -1;
  double best_value = -1.0;
  for (i = 1; i < bin_count - 1; i += 1) {
    double hz = ((double)(i + 1u) * sample_rate) / frame_size;
    if (hz < min_hz || hz > max_hz) {
      continue;
    }
    if (s_hps[i] > best_value) {
      best_value = s_hps[i];
      best_index = (int)i;
    }
  }

  if (best_index < 0) {
    return nan_d();
  }
  if (best_index < 1 || (uint32_t)best_index >= bin_count - 1u) {
    return ((double)((uint32_t)best_index + 1u) * sample_rate) / frame_size;
  }

  double off = parabolic_peak_offset(s_hps[(uint32_t)best_index - 1u], s_hps[(uint32_t)best_index], s_hps[(uint32_t)best_index + 1u]);
  double hz = (((double)best_index + off + 1.0) * sample_rate) / frame_size;
  if (is_finite_f64(hz) && hz >= min_hz && hz <= max_hz) {
    return hz;
  }
  return ((double)((uint32_t)best_index + 1u) * sample_rate) / frame_size;
}

double find_dominant_spectrum_points(uint32_t freq_off, uint32_t mag_off, uint32_t count, double min_hz, double max_hz) {
  uint32_t i;
  if (count < 3u || count > MAX_BINS) {
    return nan_d();
  }

  i = 0;
  for (; i + 4u <= count; i += 4u) {
    double m0 = f64_at(mag_off + i * 8u);
    double m1 = f64_at(mag_off + (i + 1u) * 8u);
    double m2 = f64_at(mag_off + (i + 2u) * 8u);
    double m3 = f64_at(mag_off + (i + 3u) * 8u);
    s_mag[i] = is_finite_f64(m0) ? m0 : 0.0;
    s_mag[i + 1u] = is_finite_f64(m1) ? m1 : 0.0;
    s_mag[i + 2u] = is_finite_f64(m2) ? m2 : 0.0;
    s_mag[i + 3u] = is_finite_f64(m3) ? m3 : 0.0;
  }
  for (; i < count; i += 1) {
    double m = f64_at(mag_off + i * 8u);
    s_mag[i] = is_finite_f64(m) ? m : 0.0;
  }

  harmonic_product_spectrum(count);

  int best_index = -1;
  double best_value = -1.0;
  for (i = 1; i < count - 1; i += 1) {
    double hz = f64_at(freq_off + i * 8u);
    if (!is_finite_f64(hz) || hz < min_hz || hz > max_hz) {
      continue;
    }
    if (s_hps[i] > best_value) {
      best_value = s_hps[i];
      best_index = (int)i;
    }
  }

  if (best_index < 0) {
    return nan_d();
  }
  if (best_index < 1 || (uint32_t)best_index >= count - 1u) {
    return f64_at(freq_off + (uint32_t)best_index * 8u);
  }

  double offset = parabolic_peak_offset(s_hps[(uint32_t)best_index - 1u], s_hps[(uint32_t)best_index], s_hps[(uint32_t)best_index + 1u]);
  double i_float = (double)best_index + offset;
  double f_i = floor_nonneg(i_float);
  double c_i = ceil_nonneg(i_float);
  uint32_t i0 = (uint32_t)f_i;
  uint32_t i1 = (uint32_t)c_i;
  if (i0 > count - 1u) {
    i0 = count - 1u;
  }
  if (i1 > count - 1u) {
    i1 = count - 1u;
  }
  double t = i_float - (double)i0;
  double f0 = f64_at(freq_off + i0 * 8u);
  double f1 = f64_at(freq_off + i1 * 8u);
  double hz = f0 * (1.0 - t) + f1 * t;
  if (is_finite_f64(hz)) {
    return hz;
  }
  return f64_at(freq_off + (uint32_t)best_index * 8u);
}

uint32_t pick_loudest_frame_f64(uint32_t data_off, uint32_t frame_count, uint32_t bin_count) {
  uint32_t f;
  if (frame_count == 0u || bin_count == 0u) {
    return 0u;
  }
  uint32_t best = 0u;
  double best_sum = -1.0;
  for (f = 0; f < frame_count; f += 1) {
    uint32_t row = data_off + f * bin_count * 8u;
    double sum = 0.0;
    uint32_t i;
    i = 0;
    for (; i + 4u <= bin_count; i += 4u) {
      double v0 = f64_at(row + i * 8u);
      double v1 = f64_at(row + (i + 1u) * 8u);
      double v2 = f64_at(row + (i + 2u) * 8u);
      double v3 = f64_at(row + (i + 3u) * 8u);
      if (is_finite_f64(v0)) {
        sum += v0;
      }
      if (is_finite_f64(v1)) {
        sum += v1;
      }
      if (is_finite_f64(v2)) {
        sum += v2;
      }
      if (is_finite_f64(v3)) {
        sum += v3;
      }
    }
    for (; i < bin_count; i += 1) {
      double v = f64_at(row + i * 8u);
      if (is_finite_f64(v)) {
        sum += v;
      }
    }
    if (sum > best_sum) {
      best_sum = sum;
      best = f;
    }
  }
  return best;
}
