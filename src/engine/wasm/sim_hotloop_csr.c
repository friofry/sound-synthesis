#include <stddef.h>
#include <stdint.h>

extern unsigned char __heap_base;

static uint32_t g_free_count = 0;
static uint32_t g_row_ptr_len = 0;
static uint32_t g_nnz = 0;

static uint32_t g_offset_u = 0;
static uint32_t g_offset_v = 0;
static uint32_t g_offset_spring = 0;
static uint32_t g_offset_row_ptr = 0;
static uint32_t g_offset_col = 0;
static uint32_t g_offset_coeff = 0;
static uint32_t g_offset_diag = 0;

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

uint32_t init(uint32_t free_count, uint32_t row_ptr_len, uint32_t nnz) {
  g_free_count = free_count;
  g_row_ptr_len = row_ptr_len;
  g_nnz = nnz;

  uint32_t cursor = align8((uint32_t)(uintptr_t)&__heap_base);

  g_offset_u = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  g_offset_v = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  g_offset_spring = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  g_offset_row_ptr = cursor;
  cursor += row_ptr_len * (uint32_t)sizeof(uint32_t);

  g_offset_col = cursor;
  cursor += nnz * (uint32_t)sizeof(uint32_t);

  cursor = align8(cursor);
  g_offset_coeff = cursor;
  cursor += nnz * (uint32_t)sizeof(double);

  g_offset_diag = cursor;
  cursor += free_count * (uint32_t)sizeof(double);

  if (!ensure_memory(cursor)) {
    return 0;
  }
  return 1;
}

uint32_t get_offset_u(void) { return g_offset_u; }
uint32_t get_offset_v(void) { return g_offset_v; }
uint32_t get_offset_row_ptr(void) { return g_offset_row_ptr; }
uint32_t get_offset_col(void) { return g_offset_col; }
uint32_t get_offset_coeff(void) { return g_offset_coeff; }
uint32_t get_offset_diag(void) { return g_offset_diag; }

static void compute_spring_acceleration_csr(const double *u, double *out) {
  const uint32_t *row_ptr = u32_ptr(g_offset_row_ptr);
  const uint32_t *col = u32_ptr(g_offset_col);
  const double *coeff = f64_ptr(g_offset_coeff);
  const double *diag = f64_ptr(g_offset_diag);

  for (uint32_t i = 0; i < g_free_count; i += 1) {
    double acc = diag[i] * u[i];
    uint32_t begin = row_ptr[i];
    uint32_t end = row_ptr[i + 1];
    for (uint32_t k = begin; k < end; k += 1) {
      acc += coeff[k] * u[col[k]];
    }
    out[i] = acc;
  }
}

void euler_step(double dt, double attenuation, double square_attenuation) {
  double *u = f64_ptr(g_offset_u);
  double *v = f64_ptr(g_offset_v);
  double *spring = f64_ptr(g_offset_spring);

  compute_spring_acceleration_csr(u, spring);

  uint32_t i = 0;
  uint32_t n4 = g_free_count & ~3u;
  for (; i < n4; i += 4) {
    double acc0 = spring[i] - attenuation * v[i] - square_attenuation * abs_double(v[i]) * v[i];
    double acc1 = spring[i + 1] - attenuation * v[i + 1] - square_attenuation * abs_double(v[i + 1]) * v[i + 1];
    double acc2 = spring[i + 2] - attenuation * v[i + 2] - square_attenuation * abs_double(v[i + 2]) * v[i + 2];
    double acc3 = spring[i + 3] - attenuation * v[i + 3] - square_attenuation * abs_double(v[i + 3]) * v[i + 3];

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
  // The backend is intentionally Euler-first. Keep export for ABI compatibility.
  euler_step(dt, attenuation, square_attenuation);
}
