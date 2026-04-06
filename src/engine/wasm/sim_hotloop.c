#include <stddef.h>
#include <stdint.h>

extern unsigned char __heap_base;

static uint32_t g_free_count = 0;
static uint32_t g_ff_edge_count = 0;
static uint32_t g_fixed_edge_count = 0;

static uint32_t g_offset_u = 0;
static uint32_t g_offset_v = 0;
static uint32_t g_offset_scratch = 0;
static uint32_t g_offset_ff_edge_i = 0;
static uint32_t g_offset_ff_edge_j = 0;
static uint32_t g_offset_ff_k_over_mass_i = 0;
static uint32_t g_offset_ff_k_over_mass_j = 0;
static uint32_t g_offset_fixed_index = 0;
static uint32_t g_offset_fixed_k_over_mass = 0;
static uint32_t g_offset_k1u = 0;
static uint32_t g_offset_k1v = 0;
static uint32_t g_offset_u2 = 0;
static uint32_t g_offset_v2 = 0;
static uint32_t g_offset_u3 = 0;
static uint32_t g_offset_v3 = 0;
static uint32_t g_offset_u4 = 0;
static uint32_t g_offset_v4 = 0;
static uint32_t g_offset_k2v = 0;
static uint32_t g_offset_k3v = 0;
static uint32_t g_offset_k4v = 0;

static inline uint32_t align8(uint32_t value) {
  return (value + 7u) & ~7u;
}

static inline double abs_double(double value) {
  return value < 0.0 ? -value : value;
}

static inline uint32_t pages_for_bytes(uint32_t bytes) {
  return (bytes + 65535u) / 65536u;
}

static int ensure_memory(uint32_t required_bytes) {
  uint32_t current_pages = __builtin_wasm_memory_size(0);
  uint32_t required_pages = pages_for_bytes(required_bytes);
  if (required_pages <= current_pages) {
    return 1;
  }

  uint32_t grow_by = required_pages - current_pages;
  uint32_t result = __builtin_wasm_memory_grow(0, grow_by);
  return result != UINT32_MAX;
}

static inline double *f64_ptr(uint32_t offset_bytes) {
  return (double *)(uintptr_t)offset_bytes;
}

static inline uint32_t *u32_ptr(uint32_t offset_bytes) {
  return (uint32_t *)(uintptr_t)offset_bytes;
}

uint32_t init(uint32_t free_count, uint32_t ff_edge_count, uint32_t fixed_edge_count) {
  g_free_count = free_count;
  g_ff_edge_count = ff_edge_count;
  g_fixed_edge_count = fixed_edge_count;

  uint32_t cursor = align8((uint32_t)(uintptr_t)&__heap_base);

  g_offset_u = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  g_offset_v = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  g_offset_scratch = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  g_offset_ff_edge_i = cursor;
  cursor += ff_edge_count * (uint32_t)sizeof(uint32_t);

  g_offset_ff_edge_j = cursor;
  cursor += ff_edge_count * (uint32_t)sizeof(uint32_t);

  cursor = align8(cursor);
  g_offset_ff_k_over_mass_i = cursor;
  cursor += ff_edge_count * (uint32_t)sizeof(double);

  g_offset_ff_k_over_mass_j = cursor;
  cursor += ff_edge_count * (uint32_t)sizeof(double);

  g_offset_fixed_index = cursor;
  cursor += fixed_edge_count * (uint32_t)sizeof(uint32_t);

  cursor = align8(cursor);
  g_offset_fixed_k_over_mass = cursor;
  cursor += fixed_edge_count * (uint32_t)sizeof(double);

  g_offset_k1u = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_k1v = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_u2 = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_v2 = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_u3 = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_v3 = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_u4 = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_v4 = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_k2v = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_k3v = cursor;
  cursor += free_count * (uint32_t)sizeof(double);
  g_offset_k4v = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  cursor = align8(cursor);
  if (!ensure_memory(cursor)) {
    return 0;
  }
  return 1;
}

uint32_t get_offset_u(void) { return g_offset_u; }
uint32_t get_offset_v(void) { return g_offset_v; }
uint32_t get_offset_ff_edge_i(void) { return g_offset_ff_edge_i; }
uint32_t get_offset_ff_edge_j(void) { return g_offset_ff_edge_j; }
uint32_t get_offset_ff_k_over_mass_i(void) { return g_offset_ff_k_over_mass_i; }
uint32_t get_offset_ff_k_over_mass_j(void) { return g_offset_ff_k_over_mass_j; }
uint32_t get_offset_fixed_index(void) { return g_offset_fixed_index; }
uint32_t get_offset_fixed_k_over_mass(void) { return g_offset_fixed_k_over_mass; }

static void compute_spring_acceleration(const double *u, double *out) {
  uint32_t i = 0;
  uint32_t n4 = g_free_count & ~3u;
  for (; i < n4; i += 4) {
    out[i] = 0.0;
    out[i + 1] = 0.0;
    out[i + 2] = 0.0;
    out[i + 3] = 0.0;
  }
  for (; i < g_free_count; i += 1) {
    out[i] = 0.0;
  }

  const uint32_t *edge_i = u32_ptr(g_offset_ff_edge_i);
  const uint32_t *edge_j = u32_ptr(g_offset_ff_edge_j);
  const double *k_over_mass_i = f64_ptr(g_offset_ff_k_over_mass_i);
  const double *k_over_mass_j = f64_ptr(g_offset_ff_k_over_mass_j);

  for (uint32_t e = 0; e < g_ff_edge_count; e += 1) {
    uint32_t i = edge_i[e];
    uint32_t j = edge_j[e];
    double du = u[j] - u[i];
    out[i] += k_over_mass_i[e] * du;
    out[j] -= k_over_mass_j[e] * du;
  }

  const uint32_t *fixed_index = u32_ptr(g_offset_fixed_index);
  const double *fixed_k_over_mass = f64_ptr(g_offset_fixed_k_over_mass);
  for (uint32_t e = 0; e < g_fixed_edge_count; e += 1) {
    uint32_t i = fixed_index[e];
    out[i] += fixed_k_over_mass[e] * u[i];
  }
}

static void build_acceleration(
  const double *u,
  const double *v,
  double attenuation,
  double square_attenuation,
  double *out
) {
  compute_spring_acceleration(u, out);
  uint32_t i = 0;
  uint32_t n4 = g_free_count & ~3u;
  for (; i < n4; i += 4) {
    out[i] = out[i] - attenuation * v[i] - square_attenuation * abs_double(v[i]) * v[i];
    out[i + 1] =
      out[i + 1] - attenuation * v[i + 1] - square_attenuation * abs_double(v[i + 1]) * v[i + 1];
    out[i + 2] =
      out[i + 2] - attenuation * v[i + 2] - square_attenuation * abs_double(v[i + 2]) * v[i + 2];
    out[i + 3] =
      out[i + 3] - attenuation * v[i + 3] - square_attenuation * abs_double(v[i + 3]) * v[i + 3];
  }
  for (; i < g_free_count; i += 1) {
    out[i] = out[i] - attenuation * v[i] - square_attenuation * abs_double(v[i]) * v[i];
  }
}

void euler_step(double dt, double attenuation, double square_attenuation) {
  double *u = f64_ptr(g_offset_u);
  double *v = f64_ptr(g_offset_v);
  double *spring = f64_ptr(g_offset_scratch);

  compute_spring_acceleration(u, spring);
  uint32_t i = 0;
  uint32_t n4 = g_free_count & ~3u;
  for (; i < n4; i += 4) {
    double acc0 = spring[i] - attenuation * v[i] - square_attenuation * abs_double(v[i]) * v[i];
    double acc1 =
      spring[i + 1] - attenuation * v[i + 1] - square_attenuation * abs_double(v[i + 1]) * v[i + 1];
    double acc2 =
      spring[i + 2] - attenuation * v[i + 2] - square_attenuation * abs_double(v[i + 2]) * v[i + 2];
    double acc3 =
      spring[i + 3] - attenuation * v[i + 3] - square_attenuation * abs_double(v[i + 3]) * v[i + 3];

    v[i] += acc0 * dt;
    v[i + 1] += acc1 * dt;
    v[i + 2] += acc2 * dt;
    v[i + 3] += acc3 * dt;

    u[i] += v[i] * dt;
    u[i + 1] += v[i + 1] * dt;
    u[i + 2] += v[i + 2] * dt;
    u[i + 3] += v[i + 3] * dt;
  }
  for (; i < g_free_count; i += 1) {
    double acc = spring[i] - attenuation * v[i] - square_attenuation * abs_double(v[i]) * v[i];
    v[i] += acc * dt;
    u[i] += v[i] * dt;
  }
}

void rk4_step(double dt, double attenuation, double square_attenuation) {
  double *u = f64_ptr(g_offset_u);
  double *v = f64_ptr(g_offset_v);

  double *k1u = f64_ptr(g_offset_k1u);
  double *k1v = f64_ptr(g_offset_k1v);
  double *u2 = f64_ptr(g_offset_u2);
  double *v2 = f64_ptr(g_offset_v2);
  double *u3 = f64_ptr(g_offset_u3);
  double *v3 = f64_ptr(g_offset_v3);
  double *u4 = f64_ptr(g_offset_u4);
  double *v4 = f64_ptr(g_offset_v4);
  double *k2v = f64_ptr(g_offset_k2v);
  double *k3v = f64_ptr(g_offset_k3v);
  double *k4v = f64_ptr(g_offset_k4v);

  build_acceleration(u, v, attenuation, square_attenuation, k1v);
  uint32_t i = 0;
  uint32_t n4 = g_free_count & ~3u;
  for (; i < n4; i += 4) {
    k1u[i] = v[i];
    k1u[i + 1] = v[i + 1];
    k1u[i + 2] = v[i + 2];
    k1u[i + 3] = v[i + 3];
  }
  for (; i < g_free_count; i += 1) {
    k1u[i] = v[i];
  }

  i = 0;
  for (; i < n4; i += 4) {
    u2[i] = u[i] + (k1u[i] * dt) * 0.5;
    v2[i] = v[i] + (k1v[i] * dt) * 0.5;
    u2[i + 1] = u[i + 1] + (k1u[i + 1] * dt) * 0.5;
    v2[i + 1] = v[i + 1] + (k1v[i + 1] * dt) * 0.5;
    u2[i + 2] = u[i + 2] + (k1u[i + 2] * dt) * 0.5;
    v2[i + 2] = v[i + 2] + (k1v[i + 2] * dt) * 0.5;
    u2[i + 3] = u[i + 3] + (k1u[i + 3] * dt) * 0.5;
    v2[i + 3] = v[i + 3] + (k1v[i + 3] * dt) * 0.5;
  }
  for (; i < g_free_count; i += 1) {
    u2[i] = u[i] + (k1u[i] * dt) * 0.5;
    v2[i] = v[i] + (k1v[i] * dt) * 0.5;
  }
  build_acceleration(u2, v2, attenuation, square_attenuation, k2v);

  i = 0;
  for (; i < n4; i += 4) {
    u3[i] = u[i] + (v2[i] * dt) * 0.5;
    v3[i] = v[i] + (k2v[i] * dt) * 0.5;
    u3[i + 1] = u[i + 1] + (v2[i + 1] * dt) * 0.5;
    v3[i + 1] = v[i + 1] + (k2v[i + 1] * dt) * 0.5;
    u3[i + 2] = u[i + 2] + (v2[i + 2] * dt) * 0.5;
    v3[i + 2] = v[i + 2] + (k2v[i + 2] * dt) * 0.5;
    u3[i + 3] = u[i + 3] + (v2[i + 3] * dt) * 0.5;
    v3[i + 3] = v[i + 3] + (k2v[i + 3] * dt) * 0.5;
  }
  for (; i < g_free_count; i += 1) {
    u3[i] = u[i] + (v2[i] * dt) * 0.5;
    v3[i] = v[i] + (k2v[i] * dt) * 0.5;
  }
  build_acceleration(u3, v3, attenuation, square_attenuation, k3v);

  i = 0;
  for (; i < n4; i += 4) {
    u4[i] = u[i] + v3[i] * dt;
    v4[i] = v[i] + k3v[i] * dt;
    u4[i + 1] = u[i + 1] + v3[i + 1] * dt;
    v4[i + 1] = v[i + 1] + k3v[i + 1] * dt;
    u4[i + 2] = u[i + 2] + v3[i + 2] * dt;
    v4[i + 2] = v[i + 2] + k3v[i + 2] * dt;
    u4[i + 3] = u[i + 3] + v3[i + 3] * dt;
    v4[i + 3] = v[i + 3] + k3v[i + 3] * dt;
  }
  for (; i < g_free_count; i += 1) {
    u4[i] = u[i] + v3[i] * dt;
    v4[i] = v[i] + k3v[i] * dt;
  }
  build_acceleration(u4, v4, attenuation, square_attenuation, k4v);

  i = 0;
  for (; i < n4; i += 4) {
    u[i] += (dt / 6.0) * (k1u[i] + 2.0 * v2[i] + 2.0 * v3[i] + v4[i]);
    v[i] += (dt / 6.0) * (k1v[i] + 2.0 * k2v[i] + 2.0 * k3v[i] + k4v[i]);
    u[i + 1] += (dt / 6.0) * (k1u[i + 1] + 2.0 * v2[i + 1] + 2.0 * v3[i + 1] + v4[i + 1]);
    v[i + 1] += (dt / 6.0) * (k1v[i + 1] + 2.0 * k2v[i + 1] + 2.0 * k3v[i + 1] + k4v[i + 1]);
    u[i + 2] += (dt / 6.0) * (k1u[i + 2] + 2.0 * v2[i + 2] + 2.0 * v3[i + 2] + v4[i + 2]);
    v[i + 2] += (dt / 6.0) * (k1v[i + 2] + 2.0 * k2v[i + 2] + 2.0 * k3v[i + 2] + k4v[i + 2]);
    u[i + 3] += (dt / 6.0) * (k1u[i + 3] + 2.0 * v2[i + 3] + 2.0 * v3[i + 3] + v4[i + 3]);
    v[i + 3] += (dt / 6.0) * (k1v[i + 3] + 2.0 * k2v[i + 3] + 2.0 * k3v[i + 3] + k4v[i + 3]);
  }
  for (; i < g_free_count; i += 1) {
    u[i] += (dt / 6.0) * (k1u[i] + 2.0 * v2[i] + 2.0 * v3[i] + v4[i]);
    v[i] += (dt / 6.0) * (k1v[i] + 2.0 * k2v[i] + 2.0 * k3v[i] + k4v[i]);
  }
}
