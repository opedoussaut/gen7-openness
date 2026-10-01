"""Evaluator regression tests: python -m unittest discover -s tests (from cad-benchmark/)."""
import os
import tempfile
import unittest

from cadbench.evaluate import evaluate
from cadbench.paths import TASKS
from cadbench.prompts import context_for, extract_code
from cadbench.evaluate import load_task

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def code(task, subs=()):
    s = open(os.path.join(TASKS, task, "reference.py")).read()
    for a, b in subs:
        assert a in s
        s = s.replace(a, b)
    return s


class Evaluator(unittest.TestCase):
    def run_eval(self, task, src):
        with tempfile.TemporaryDirectory() as d:
            return evaluate(task, src, d)

    def test_reference_accepted(self):
        r = self.run_eval("l1-mounting-plate", code("l1-mounting-plate"))
        self.assertTrue(r["accepted"])
        self.assertAlmostEqual(r["scores"]["overall"], 1.0, places=3)

    def test_wrong_hole_rejected(self):
        r = self.run_eval("l1-mounting-plate", code("l1-mounting-plate", [('"corner_hole_d": 9.0', '"corner_hole_d": 8.0')]))
        self.assertFalse(r["accepted"])
        self.assertIn("hole_0", r["critical_failed"])

    def test_critical_failure_blocks_high_score(self):
        r = self.run_eval("l4-shaft-support", code("l4-shaft-support", [('"clearance": 0.2', '"clearance": 0.0')]))
        self.assertGreater(r["scores"]["overall"], 0.9)
        self.assertFalse(r["accepted"])

    def test_design_intent_probe(self):
        r = self.run_eval("l1-mounting-plate", code("l1-mounting-plate", [('dx, dy = L / 2 - p["edge_offset"], W / 2 - p["edge_offset"]', 'dx, dy = 48.0, 28.0')]))
        self.assertIn("longer", [p["id"] for p in r["probes"] if not p["passed"]])

    def test_broken_program(self):
        r = self.run_eval("l1-mounting-plate", "import cadquery as cq\nresult = cq.Workplane().boxx(1)")
        self.assertFalse(r["executed"])
        self.assertEqual(r["scores"]["overall"], 0.0)


class Prompts(unittest.TestCase):
    def test_grooming_reduces_context(self):
        t = load_task("l3-cold-plate")
        raw, rr = context_for(t, "raw")
        gro, gr = context_for(t, "groomed")
        self.assertLess(gr["bytes_kept"], rr["bytes_kept"])
        self.assertIn("part-coldplate", gr["kept_tags"])
        self.assertNotIn("noise-erp", gr["kept_tags"])

    def test_extract_code(self):
        self.assertEqual(extract_code("x\n```python\na=1\n```\n"), "a=1\n")
        self.assertEqual(extract_code("```python\na=1\nb"), "a=1\nb")


if __name__ == "__main__":
    unittest.main()
