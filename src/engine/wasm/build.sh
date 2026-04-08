#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_C_F64="${SCRIPT_DIR}/sim_hotloop.c"
OUTPUT_WASM_F64="${SCRIPT_DIR}/sim_hotloop.wasm"
OUTPUT_BASE64_TS_F64="${SCRIPT_DIR}/sim_hotloop.wasm.base64.ts"
INPUT_C_F32="${SCRIPT_DIR}/sim_hotloop_f32.c"
OUTPUT_WASM_F32="${SCRIPT_DIR}/sim_hotloop_f32.wasm"
OUTPUT_BASE64_TS_F32="${SCRIPT_DIR}/sim_hotloop_f32.wasm.base64.ts"
INPUT_C_SIMD_F64="${SCRIPT_DIR}/sim_hotloop_simd.c"
OUTPUT_WASM_SIMD_F64="${SCRIPT_DIR}/sim_hotloop_simd.wasm"
OUTPUT_BASE64_TS_SIMD_F64="${SCRIPT_DIR}/sim_hotloop_simd.wasm.base64.ts"
INPUT_C_SIMD_F32="${SCRIPT_DIR}/sim_hotloop_simd_f32.c"
OUTPUT_WASM_SIMD_F32="${SCRIPT_DIR}/sim_hotloop_simd_f32.wasm"
OUTPUT_BASE64_TS_SIMD_F32="${SCRIPT_DIR}/sim_hotloop_simd_f32.wasm.base64.ts"
INPUT_C_CSR_F32="${SCRIPT_DIR}/sim_hotloop_csr_f32.c"
OUTPUT_WASM_CSR_F32="${SCRIPT_DIR}/sim_hotloop_csr_f32.wasm"
OUTPUT_BASE64_TS_CSR_F32="${SCRIPT_DIR}/sim_hotloop_csr_f32.wasm.base64.ts"
INPUT_C_CSR_F64="${SCRIPT_DIR}/sim_hotloop_csr.c"
OUTPUT_WASM_CSR_F64="${SCRIPT_DIR}/sim_hotloop_csr.wasm"
OUTPUT_BASE64_TS_CSR_F64="${SCRIPT_DIR}/sim_hotloop_csr.wasm.base64.ts"

if [[ -x "/opt/homebrew/opt/emscripten/libexec/llvm/bin/clang" ]]; then
  CLANG="/opt/homebrew/opt/emscripten/libexec/llvm/bin/clang"
elif [[ -x "/opt/homebrew/opt/llvm/bin/clang" ]]; then
  CLANG="/opt/homebrew/opt/llvm/bin/clang"
else
  CLANG="clang"
fi

build_wasm() {
  local input_c="$1"
  local output_wasm="$2"
  local output_base64_ts="$3"
  local const_name="$4"
  local simd_flag="${5:-}"

  "${CLANG}" \
  --target=wasm32 \
  -O3 \
  -ffast-math \
  -fno-builtin \
  ${simd_flag} \
  -nostdlib \
  -Wl,--no-entry \
  -Wl,--export=init \
  -Wl,--export=euler_step \
  -Wl,--export=rk4_step \
  -Wl,--export=get_offset_u \
  -Wl,--export=get_offset_v \
  -Wl,--export=get_offset_ff_edge_i \
  -Wl,--export=get_offset_ff_edge_j \
  -Wl,--export=get_offset_ff_k_over_mass_i \
  -Wl,--export=get_offset_ff_k_over_mass_j \
  -Wl,--export=get_offset_fixed_index \
  -Wl,--export=get_offset_fixed_k_over_mass \
  -Wl,--export-memory \
  -Wl,--initial-memory=131072 \
  -Wl,--max-memory=33554432 \
  -Wl,--import-undefined \
  -Wl,--export=__heap_base \
  "${input_c}" \
  -o "${output_wasm}"

  {
    printf "export const %s = '" "${const_name}"
    base64 < "${output_wasm}" | tr -d '\n'
    printf "';\n"
  } > "${output_base64_ts}"
}

build_wasm_csr() {
  local input_c="$1"
  local output_wasm="$2"
  local output_base64_ts="$3"
  local const_name="$4"
  local align_exports="$5"

  "${CLANG}" \
  --target=wasm32 \
  -O3 \
  -ffast-math \
  -fno-builtin \
  -msimd128 \
  -nostdlib \
  -Wl,--no-entry \
  -Wl,--export=init \
  -Wl,--export=euler_step \
  -Wl,--export=rk4_step \
  -Wl,--export=get_offset_u \
  -Wl,--export=get_offset_v \
  -Wl,--export=get_offset_row_ptr \
  -Wl,--export=get_offset_col \
  -Wl,--export=get_offset_coeff \
  -Wl,--export=get_offset_diag \
  -Wl,--export-memory \
  -Wl,--initial-memory=131072 \
  -Wl,--max-memory=33554432 \
  -Wl,--import-undefined \
  -Wl,--export=__heap_base \
  "${input_c}" \
  -o "${output_wasm}"

  {
    printf "export const %s = '" "${const_name}"
    base64 < "${output_wasm}" | tr -d '\n'
    printf "';\n"
  } > "${output_base64_ts}"
}

build_wasm "${INPUT_C_F64}" "${OUTPUT_WASM_F64}" "${OUTPUT_BASE64_TS_F64}" "SIM_HOTLOOP_WASM_BASE64"
build_wasm "${INPUT_C_F32}" "${OUTPUT_WASM_F32}" "${OUTPUT_BASE64_TS_F32}" "SIM_HOTLOOP_F32_WASM_BASE64"
build_wasm "${INPUT_C_SIMD_F64}" "${OUTPUT_WASM_SIMD_F64}" "${OUTPUT_BASE64_TS_SIMD_F64}" "SIM_HOTLOOP_SIMD_WASM_BASE64" "-msimd128"
build_wasm "${INPUT_C_SIMD_F32}" "${OUTPUT_WASM_SIMD_F32}" "${OUTPUT_BASE64_TS_SIMD_F32}" "SIM_HOTLOOP_SIMD_F32_WASM_BASE64" "-msimd128"
build_wasm_csr "${INPUT_C_CSR_F64}" "${OUTPUT_WASM_CSR_F64}" "${OUTPUT_BASE64_TS_CSR_F64}" "SIM_HOTLOOP_CSR_WASM_BASE64" "f64"
build_wasm_csr "${INPUT_C_CSR_F32}" "${OUTPUT_WASM_CSR_F32}" "${OUTPUT_BASE64_TS_CSR_F32}" "SIM_HOTLOOP_CSR_F32_WASM_BASE64" "f32"
