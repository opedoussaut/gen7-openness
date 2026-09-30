# Cinematic intro

`scene.html` draws the 37-second intro deterministically (`render(t)`); `render.py` renders it frame by frame with Playwright and ffmpeg (`cd media && python3 render.py` → `silent.mp4`). Fonts: Inter (SIL Open Font License), from @fontsource/inter.

`scene-system1-system2.html` is the 52.5-second Decision Intelligence film (COMPLEXITY → GROOM → DECIDE → CONFIDENCE GATE → REASON → ACT → HUMAN ACCOUNTABILITY → MEASURE → GEN7). `python3 render-system1-system2.py` renders it, synthesises the soundtrack (`sound-system1-system2.py`, numpy/scipy) and writes `GEN7-cinematic-intro-system1-system2.mp4` plus its poster. MEASURE figures come from the simulated R-17 reference run; System 1 confidences are the model's real outputs for R-17.
