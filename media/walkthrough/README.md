# Live-interface walkthrough (≈5 min)

Regenerates `GEN7-live-interface-walkthrough-5min.mp4` from the **public preview URL**, so it always shows what is deployed.

1. `capture.py` drives the app one step at a time (the app's own Step control) for R-22 and R-17 and records, per step, a full-page 2× screenshot plus the rectangles of the active elements. It also captures Learn, AI economics and the Technical view. `recap_econ.py` refreshes only the Economics capture.
2. `compose.py [seconds]` builds the edit: a virtual camera eases to what is active, a spotlight dims the rest, presenter captions explain each step (the app's own narration, with curated messages at the key moments: triage, the Loop A clash and each reaction step, resolution). Output 1920×1080, 30 fps.
3. `sound.py` writes a calm bed (numpy/scipy); mux with ffmpeg.

Paths are set for a scratch directory (`WALK_DIR`, fonts converted from `../inter-*.woff2`); adjust before running. Requires Playwright (Chromium), OpenCV, Pillow, fontTools + brotli, ffmpeg.
