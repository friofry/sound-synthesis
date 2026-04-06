#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUT_C="${SCRIPT_DIR}/sim_hotloop.c"
OUTPUT_WASM="${SCRIPT_DIR}/sim_hotloop.wasm"
OUTPUT_BASE64_TS="${SCRIPT_DIR}/sim_hotloop.wasm.base64.ts"

if [[ -x "/opt/homebrew/opt/emscripten/libexec/llvm/bin/clang" ]]; then
  CLANG="/opt/homebrew/opt/emscripten/libexec/llvm/bin/clang"
elif [[ -x "/opt/homebrew/opt/llvm/bin/clang" ]]; then
  CLANG="/opt/homebrew/opt/llvm/bin/clang"
else
  CLANG="clang"
fi

"${CLANG}" \
  --target=wasm32 \
  -O3 \
  -ffast-math \
  -fno-builtin \
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
  "${INPUT_C}" \
  -o "${OUTPUT_WASM}"

{
  printf "export const SIM_HOTLOOP_WASM_BASE64 = '"
  base64 < "${OUTPUT_WASM}" | tr -d '\n'
  printf "';\n"
} > "${OUTPUT_BASE64_TS}"
