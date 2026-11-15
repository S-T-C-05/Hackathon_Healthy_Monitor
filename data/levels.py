"""Traffic-light level of one value, using ONLY the thresholds written in indicators.json.

    from data.levels import level_for
    level_for(indicator, 5.4)   # -> "red" | "yellow" | "green" | None

Returns None when the indicator has no threshold yet (status "needs_source").
In that case the app must show the personal trend, not a color that looks
like a clinical limit.

Threshold statuses:
  sourced         numbers come from a cited source (bibliography.json)
  dataset_range   lab range taken from the NASA data file
  demo_criterion  numbers chosen by the team for the demo, NOT from a source.
                  The app must label them as such.
  needs_source    no numbers yet

For personal_baseline thresholds pass the person's baseline: the level then
depends on how far `value` moved from it in the direction that matters.
"""
from __future__ import annotations

import operator
from typing import Optional

_OPS = {"<": operator.lt, "<=": operator.le, ">": operator.gt, ">=": operator.ge}
_ORDER = {"green": 0, "yellow": 1, "red": 2}


def level_for(
    indicator: dict, value: Optional[float], sex: Optional[str] = None, baseline: Optional[float] = None
) -> Optional[str]:
    th = indicator.get("thresholds") or {}
    if value is None or th.get("status") not in ("sourced", "dataset_range", "demo_criterion"):
        return None

    if th.get("type") == "absolute_limits":
        worst = "green"
        for rule in th.get("rules", []):
            if _OPS[rule["op"]](value, rule["value"]) and _ORDER[rule["level"]] > _ORDER[worst]:
                worst = rule["level"]
        return worst

    if th.get("type") == "personal_baseline":
        warn, alert = th.get("warn_deviation_pct"), th.get("alert_deviation_pct")
        if not baseline or warn is None or alert is None:
            return None
        pct = round((value / baseline - 1) * 100, 6)  # avoid float noise at the limits
        concern = indicator.get("concern_direction")
        moved = pct if concern == "high" else -pct if concern == "low" else abs(pct)
        return "red" if moved >= alert else "yellow" if moved >= warn else "green"

    if th.get("type") == "reference_range":
        # Lab ranges are not a diagnosis: outside the range is "yellow", never "red".
        rng = (th.get("by_sex") or {}).get(sex or "")
        if rng is None:
            return None
        return "green" if rng["min"] <= value <= rng["max"] else "yellow"

    return None