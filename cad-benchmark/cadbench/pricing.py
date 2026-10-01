"""Cost of a call: provider list price for APIs, measured runtime x stated rate for self-hosted models."""
import json
import os

from .paths import CONFIG

PRICING = json.load(open(os.path.join(CONFIG, "pricing.json")))


def price_entry(model_cfg):
    key = model_cfg.get("pricing_key") or f"{model_cfg['kind']}:{model_cfg['model']}"
    return key, PRICING["models"].get(key)


def call_cost(model_cfg, usage, wall_s):
    """Return a cost breakdown. Unknown components are None (shown as N/A), never 0."""
    infra = model_cfg.get("infrastructure")
    if infra:  # self-hosted: the machine is occupied for the wall-clock duration of the call
        rate = infra.get("rate_usd_per_hour")
        infra_cost = None if rate is None else wall_s * rate / 3600
        return {"basis": "infrastructure", "input": None, "cached_input": None, "cache_write": None, "output": None,
                "infrastructure": infra_cost, "total": infra_cost, "rate_usd_per_hour": rate,
                "rate_source": infra.get("rate_source")}
    key, p = price_entry(model_cfg)
    if p is None or usage.get("input") is None or usage.get("output") is None:
        return {"basis": "list_price", "pricing_key": key, "input": None, "cached_input": None, "cache_write": None,
                "output": None, "infrastructure": None, "total": None, "missing": "no verified price" if p is None else "no usage"}
    cached, write = usage.get("cached_input") or 0, usage.get("cache_write") or 0
    fresh = max(0, usage["input"] - cached - write)
    c_in, c_cached, c_write = fresh * p["input"] / 1e6, cached * p["cached_input"] / 1e6, write * p.get("cache_write", 0) / 1e6
    c_out = usage["output"] * p["output"] / 1e6
    return {"basis": "list_price", "pricing_key": key, "input": c_in, "cached_input": c_cached, "cache_write": c_write,
            "output": c_out, "infrastructure": None, "total": c_in + c_cached + c_write + c_out, "source": p.get("source")}
