# AI factory scene — physical view above the live demo

A compact SVG scene at the top of **03 · Live demo** that shows the equipment the decision is about:
the racks of the cooling loop, the requested slot, the row busway, the two CDUs, the liquid loop and the
five engineering systems the agents consult. It follows the run step by step and never drives it.

## Architecture

| File | Role |
|---|---|
| `src/ui/factory.js` | `deriveScene(run, scenario)` — **pure** function from the engine's run to a scene state. `sceneSkeleton(scene)` — SVG built once per request. `mountFactory(el, app)` — collapse toggle and repaint. |
| `styles/factory.css` | Scene styles only (`.fx-*`), using the existing design tokens. Respects `prefers-reduced-motion`. |
| `src/ui/demo.js` | Three additions: import, `<section id="factory">` above the incident bar, `factory.update(run)` in `update()`. |
| `index.html` | One `<link>` to `styles/factory.css`. |
| `test/factory.test.mjs` | Seven tests over instant R-17 and R-22 runs. |

**One source of truth.** The scene reads `engine.run` in the demo's existing `update()` cycle (already
batched with `requestAnimationFrame`). It has no timers, does not subscribe to the engine and does not call it.

**Where each element comes from**

| Scene element | Run source |
|---|---|
| Phase (overview → request → capacity → orchestration → recommendation → outcome) | `run.status`, `run.state` |
| Rack load bars and kW | `RACK_POWER` evidence from grooming (p95 per rack) |
| Loop heat, CDU capacity, busway allocation | `LOOP_SUMMARY`, `CDU`, `BUSWAY` evidence |
| Headroom (−13.1 kW, then +25.6 kW for R-17) | `calculateCoolingHeadroom` MCP results, then `recommendation.outcome` |
| Systems lit / active | `run.mcpCalls[].server`, `run.current` (the step being executed) |
| Workload change (A-07 → B-05) | Workload Agent proposal; *released* once Cooling confirms over A2A |
| Final state | `run.recommendation` (approved · reserved on the fast path · to review) |

The rack layout (which racks sit on which loop) is the facility topology from `dataset.js`. No value is
shown before grooming has produced it, and no telemetry is simulated by the scene.

**Safety and fallback.** `update()` is wrapped: if the scene ever fails, it hides itself, logs a warning,
and the demo keeps running. The scene uses a solid surface (no backdrop blur) and `contain: layout paint`
so its animations do not repaint the rest of the page. The CSS animations (coolant flow, CDU fans) run
only while the demo is running. "Hide scene" collapses it to one line, and the choice is remembered in the browser (`localStorage`, optional).

## Local testing

```bash
npm test
```

```bash
npm start
```

Then open <http://127.0.0.1:3000/#demo>. Run R-17 (complex) and R-22 (simple) with Start, Step (→), Reset and 1×/2×/4×.

## Validation (22 Oct 2026)

- `npm test`: 31/31 pass (24 existing + 7 new). `npm run build`: OK, `dist/` includes the new files.
- Headless Edge at 1920 × 1080, stepping with the page's own buttons:
  - R-17: overview → request → capacity → orchestration (clash −13.1 kW, proposed change) → recommendation → outcome (+25.6 kW).
  - R-22: request → capacity → fast path (DCIM only) → reserved.
  - Reset returns to the overview. A paced replay at 4× completes.
  - No console errors or warnings.
- Frame rate during a 4× paced run (headless, software rendering): 32–35 fps with the scene, 32–33 fps without it.
- No vendor product names in the scene markup or captions (tested).

## Screenshots

`before-demo-1080p.png` → `after-demo-1080p.png`, `after-demo-1080p-outcome.png`, `after-demo-1080p-collapsed.png`,
and the scene alone in each phase: `scene-01-ready.png` … `scene-08-r22-fast-path-outcome.png`.
