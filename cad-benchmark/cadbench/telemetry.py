"""Telemetry: resource sampling (GPU / CPU) and OpenTelemetry-shaped spans.

Spans always go to a local JSONL file in the run folder (OTLP JSON shape, GenAI semantic-convention
attribute names). If OTEL_EXPORTER_OTLP_ENDPOINT is set, they are also POSTed as OTLP/HTTP JSON —
Langfuse, OpenLIT, Grafana Tempo/Alloy and the OpenTelemetry Collector all accept this.
Example for Langfuse:
  OTEL_EXPORTER_OTLP_ENDPOINT=https://cloud.langfuse.com/api/public/otel
  OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64 public:secret>
"""
import json
import os
import secrets
import shutil
import subprocess
import threading
import time
import urllib.request


# ------------------------------------------------------------------ resource sampling
class ResourceSampler:
    """Samples GPU power/utilisation/memory (nvidia-smi) and process-wide CPU while a call runs.

    Energy is integrated from measured power samples (trapezoidal rule). Nothing is extrapolated:
    if nvidia-smi is absent, every GPU field is None and is displayed as N/A.
    """

    def __init__(self, interval_s=0.25, on_sample=None):
        self.interval = interval_s
        self.on_sample = on_sample
        self.samples = []
        self._stop = threading.Event()
        self._thread = None
        self._proc = None
        self.gpu_available = shutil.which("nvidia-smi") is not None
        try:
            import psutil  # optional
            self._psutil = psutil
            psutil.cpu_percent(None)
        except Exception:
            self._psutil = None

    @staticmethod
    def gpu_inventory():
        if not shutil.which("nvidia-smi"):
            return []
        try:
            out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version,power.limit",
                                  "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=10).stdout
            gpus = []
            for line in out.strip().splitlines():
                name, mem, drv, plim = [x.strip() for x in line.split(",")]
                gpus.append({"name": name, "memory_total_mib": _f(mem), "driver": drv, "power_limit_w": _f(plim)})
            return gpus
        except Exception:
            return []

    def _gpu_reader(self):
        cmd = ["nvidia-smi", "--query-gpu=index,power.draw,utilization.gpu,memory.used",
               "--format=csv,noheader,nounits", f"-lms={int(self.interval * 1000)}"]
        self._proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        batch, last_t = {}, None
        for line in self._proc.stdout:
            if self._stop.is_set():
                break
            try:
                idx, pw, util, mem = [x.strip() for x in line.split(",")]
            except ValueError:
                continue
            t = time.perf_counter()
            batch[idx] = (_f(pw), _f(util), _f(mem))
            if last_t is None or t - last_t >= self.interval * 0.8:
                s = {"t": t, "gpu_power_w": sum(v[0] or 0 for v in batch.values()),
                     "gpu_util_pct": max((v[1] or 0) for v in batch.values()),
                     "gpu_mem_mib": sum(v[2] or 0 for v in batch.values()), "cpu_pct": self._cpu()}
                self.samples.append(s)
                if self.on_sample:
                    self.on_sample(s)
                last_t = t

    def _cpu(self):
        return self._psutil.cpu_percent(None) if self._psutil else None

    def _cpu_reader(self):
        while not self._stop.wait(self.interval):
            s = {"t": time.perf_counter(), "gpu_power_w": None, "gpu_util_pct": None, "gpu_mem_mib": None, "cpu_pct": self._cpu()}
            self.samples.append(s)
            if self.on_sample:
                self.on_sample(s)

    def __enter__(self):
        self.t0 = time.perf_counter()
        self._thread = threading.Thread(target=self._gpu_reader if self.gpu_available else self._cpu_reader, daemon=True)
        self._thread.start()
        return self

    def __exit__(self, *exc):
        self.t1 = time.perf_counter()
        self._stop.set()
        if self._proc:
            self._proc.terminate()
        if self._thread:
            self._thread.join(timeout=2)

    def summary(self):
        dur = self.t1 - self.t0
        gpu = [s for s in self.samples if s["gpu_power_w"] is not None]
        out = {"duration_s": dur, "samples": len(self.samples), "gpu_measured": bool(gpu),
               "gpu_seconds": None, "gpu_util_mean_pct": None, "gpu_mem_peak_mib": None,
               "gpu_power_mean_w": None, "energy_wh": None,
               "cpu_util_mean_pct": _mean([s["cpu_pct"] for s in self.samples if s["cpu_pct"] is not None])}
        if len(gpu) >= 2:
            e_j = sum((gpu[i]["gpu_power_w"] + gpu[i - 1]["gpu_power_w"]) / 2 * (gpu[i]["t"] - gpu[i - 1]["t"])
                      for i in range(1, len(gpu)))
            # extend the first/last sample to the call boundaries (no extrapolation beyond the call)
            e_j += gpu[0]["gpu_power_w"] * max(0.0, gpu[0]["t"] - self.t0) + gpu[-1]["gpu_power_w"] * max(0.0, self.t1 - gpu[-1]["t"])
            out.update({"gpu_seconds": dur, "gpu_util_mean_pct": _mean([s["gpu_util_pct"] for s in gpu]),
                        "gpu_mem_peak_mib": max(s["gpu_mem_mib"] for s in gpu),
                        "gpu_power_mean_w": _mean([s["gpu_power_w"] for s in gpu]), "energy_wh": e_j / 3600})
        return out


def _f(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def _mean(xs):
    return sum(xs) / len(xs) if xs else None


# ------------------------------------------------------------------ spans
class Tracer:
    def __init__(self, path, service="gen7-cad-benchmark"):
        self.path = path
        self.service = service
        self.endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
        self.headers = {}
        for kv in filter(None, os.environ.get("OTEL_EXPORTER_OTLP_HEADERS", "").split(",")):
            k, _, v = kv.partition("=")
            self.headers[k.strip()] = v.strip()
        self.export_errors = 0

    def span(self, name, trace_id=None, parent=None, **attrs):
        return Span(self, name, trace_id or secrets.token_hex(16), parent, attrs)

    def emit(self, span):
        rec = {"traceId": span.trace_id, "spanId": span.span_id, "parentSpanId": span.parent or "",
               "name": span.name, "kind": 1, "startTimeUnixNano": str(span.start_ns),
               "endTimeUnixNano": str(span.end_ns), "attributes": [_attr(k, v) for k, v in span.attrs.items() if v is not None],
               "status": {"code": 2 if span.attrs.get("error") else 1}}
        with open(self.path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec) + "\n")
        if self.endpoint:
            body = {"resourceSpans": [{"resource": {"attributes": [_attr("service.name", self.service)]},
                                       "scopeSpans": [{"scope": {"name": "cadbench"}, "spans": [rec]}]}]}
            try:
                req = urllib.request.Request(f"{self.endpoint}/v1/traces", data=json.dumps(body).encode(), method="POST",
                                             headers={"Content-Type": "application/json", **self.headers})
                urllib.request.urlopen(req, timeout=5).read()
            except Exception:
                self.export_errors += 1


class Span:
    def __init__(self, tracer, name, trace_id, parent, attrs):
        self.tracer, self.name, self.trace_id, self.parent = tracer, name, trace_id, parent
        self.span_id = secrets.token_hex(8)
        self.attrs = dict(attrs)

    def __enter__(self):
        self.start_ns = time.time_ns()
        return self

    def set(self, **attrs):
        self.attrs.update(attrs)

    def __exit__(self, et, ev, tb):
        self.end_ns = time.time_ns()
        if et:
            self.attrs["error"] = f"{et.__name__}: {ev}"
        self.tracer.emit(self)
        return False


def _attr(k, v):
    if isinstance(v, bool):
        val = {"boolValue": v}
    elif isinstance(v, int):
        val = {"intValue": str(v)}
    elif isinstance(v, float):
        val = {"doubleValue": v}
    else:
        val = {"stringValue": str(v)}
    return {"key": k, "value": val}
