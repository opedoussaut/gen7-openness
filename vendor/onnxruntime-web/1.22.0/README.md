# ONNX Runtime Web 1.22.0 (vendored)

Copied unchanged from the npm package `onnxruntime-web@1.22.0` (MIT licence, see LICENSE) so that the
GEN7 demonstrator runs its System 1 decision model entirely from GitHub Pages, with no CDN at run time.

- `ort.webgpu.min.mjs` + `ort-wasm-simd-threaded.jsep.*` — WebGPU execution provider (preferred)
- `ort.wasm.min.mjs` + `ort-wasm-simd-threaded.*` — WebAssembly CPU execution provider (fallback)
