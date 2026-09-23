"""Small development diagnostic, not a held-out accuracy benchmark."""
import json
from pathlib import Path
import statistics
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from worker.models import LayaRanker

cases = json.loads((ROOT / "benchmarks/cases.json").read_text())
model = LayaRanker(ROOT / "models/laya")
model.rank("预热", "ceshi", ["测试", "测视"])
results = []
for case in cases:
    forward = model.rank(case["context"], case["pinyin"], case["candidates"])
    reverse = model.rank(case["context"], case["pinyin"], list(reversed(case["candidates"])))
    results.append({**case, "result": forward, "reversed": reverse,
                    "correct": forward["choice"] in case["acceptable"],
                    "order_stable": forward["choice"] == reverse["choice"]})
    print(case["context"], forward["choice"], results[-1]["correct"], forward["elapsed_ms"], flush=True)
latencies = sorted(row["result"]["elapsed_ms"] for row in results)
report = {"kind": "development diagnostic; curated candidates; not held-out", "count": len(results),
          "correct": sum(r["correct"] for r in results), "order_stable": sum(r["order_stable"] for r in results),
          "p50_ms": statistics.median(latencies), "p95_ms": latencies[math.ceil(len(latencies)*.95)-1], "results": results}
(ROOT / ".runtime/laya-evaluation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k:v for k,v in report.items() if k!="results"}, ensure_ascii=False))
