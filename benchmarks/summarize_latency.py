"""Summarize synthetic Rime latency TSVs (no third-party dependencies)."""
import csv
import json
import math
from pathlib import Path
import statistics
import sys


def stats(values):
    ordered = sorted(values)
    return {
        "count": len(values),
        "p50_ms": round(statistics.median(values), 3),
        "p95_ms": ordered[math.ceil(0.95 * len(ordered)) - 1],
        "max_ms": max(values),
        "total_ms": round(sum(values), 3),
    }


def summarize(filename):
    with Path(filename).open() as stream:
        rows = list(csv.reader(stream, delimiter="\t"))
    targets = [r for r in rows if r[2] == "target"]
    commits = [r for r in rows if r[2] == "prefix" and r[3].endswith(" ")]
    return {
        "file": Path(filename).name,
        "target_keys": stats([float(r[4]) for r in targets]),
        "all_keys_including_prefix_and_space": stats([float(r[4]) for r in rows]),
        "space_commit_keys": stats([float(r[4]) for r in commits]),
        "final_candidates": [
            {"round": int(r[0]), "case": int(r[1]), "keys": r[3], "first": r[5]}
            for r in targets if r[3] in {"youxiang", "jintiantianqihenhao"}
        ],
    }


if __name__ == "__main__":
    print(json.dumps([summarize(f) for f in sys.argv[1:]], ensure_ascii=False, indent=2))
