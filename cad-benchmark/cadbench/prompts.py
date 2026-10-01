"""Prompt construction and deterministic context grooming (Lean AI).

Every model receives byte-identical prompts for the same task and context mode.
"""
import os
import re

from .paths import ROOT

SYSTEM = """You are a senior mechanical CAD engineer. You write CadQuery programs (Python, cadquery 2.x).

Output contract — follow it exactly:
1. Reply with ONE complete Python program inside a single ```python code block. No other code blocks.
2. The program must `import cadquery as cq`, define a module-level dict `PARAMS` holding every driving dimension
   (use exactly the key names the task lists), and define `build(p=PARAMS)` that returns the model.
   build() must derive all geometry from `p` so that changing a PARAMS value updates the model consistently.
3. build() returns a cadquery Workplane containing ONE solid (or, for an assembly, a dict of named Workplanes).
4. End the program with `result = build()`.
5. Units are millimetres. Place the part exactly as specified.
6. Do not read or write files, do not import anything other than cadquery and math, do not call show() or display()."""

_SECTION = re.compile(r"^## \[([a-z0-9-]+)\] (.+)$", re.M)


def load_dossier():
    with open(os.path.join(ROOT, "context", "engineering-dossier.md"), encoding="utf-8") as fh:
        text = fh.read()
    marks = list(_SECTION.finditer(text))
    preamble = text[:marks[0].start()].strip()
    sections = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        sections.append({"tag": m.group(1), "title": m.group(2), "text": text[m.start():end].strip()})
    return preamble, sections


def context_for(task, mode):
    """Return (context text, grooming report). mode: raw | groomed | none."""
    if mode == "none":
        return "", {"mode": "none", "sections_total": 0, "sections_kept": 0, "bytes_raw": 0, "bytes_kept": 0}
    preamble, sections = load_dossier()
    raw = "\n\n".join(s["text"] for s in sections)
    if mode == "raw":
        kept = sections
    elif mode == "groomed":
        wanted = set(task.get("lean", []))
        kept = [s for s in sections if s["tag"] in wanted]
    else:
        raise ValueError(f"unknown context mode {mode}")
    text = "\n\n".join(s["text"] for s in kept)
    return text, {"mode": mode, "sections_total": len(sections), "sections_kept": len(kept),
                  "kept_tags": sorted({s["tag"] for s in kept}), "bytes_raw": len(raw.encode()),
                  "bytes_kept": len(text.encode()),
                  "reduction_pct": round(100 * (1 - len(text.encode()) / len(raw.encode())), 1)}


def user_message(task, context_text):
    parts = []
    if context_text:
        parts.append("<engineering_context>\n" + context_text + "\n</engineering_context>")
    parts.append("<task>\n" + task["prompt"] + "\n</task>")
    if task.get("start_code"):
        parts.append("<existing_model>\n```python\n" + task["start_code"].strip() + "\n```\n</existing_model>")
    parts.append("Reply with the complete program in one ```python code block.")
    return "\n\n".join(parts)


_CODE = re.compile(r"```(?:python|py)?\s*\n(.*?)```", re.S | re.I)


def extract_code(text):
    """Last fenced block; falls back to the whole reply if the model used no fences."""
    text = text or ""
    blocks = _CODE.findall(text)
    if blocks:
        return max(blocks, key=len) if len(blocks) > 1 and "build" not in blocks[-1] else blocks[-1]
    m = re.search(r"```(?:python|py)?\s*\n", text, re.I)   # unclosed fence (reply truncated at max_tokens)
    if m:
        return text[m.end():]
    return text
