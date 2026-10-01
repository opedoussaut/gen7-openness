# External task licences

## BenchCAD (tasks `x-benchcad-*`)

- Source: BenchCAD, edit-bench split — https://huggingface.co/datasets/BenchCAD/BenchCAD
- Licence: Creative Commons Attribution 4.0 International (CC-BY-4.0) — https://creativecommons.org/licenses/by/4.0/
- What was used: for each record, the original CadQuery program (`start.py`), the ground-truth edited program
  (`reference.py`) and the edit instruction (in `task.json`). The prompt wording around the instruction and the
  scoring rules are GEN7 additions. No other change was made to the BenchCAD programs.
- Import tool: `python -m cadbench.import_benchcad <record_id> ...`

All other tasks (`l1-*` … `l5-*`) are original GEN7 tasks written for this benchmark.
