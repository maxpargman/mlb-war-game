"""
intake.py — Slice 3.1: scaffold + intake.

Loads every raw source the canonical pipeline depends on, including the new
Batting.csv/Pitching.csv stat files, asserting each one's schema still
matches what downstream slices expect (Gate 1 schema assertions — fail
loudly on a source-format change instead of silently propagating it).
Prints a Gate 1 intake report: row/column counts, year range, and distinct
player count per source.

This slice does NO joining, ID resolution, or transformation — that starts
in slice 3.2. The old pipeline (data/build_*.py) and its outputs are
untouched; this lives entirely in data/pipeline_v2/.

Run with the mlbwar env active, from the repo root:
    python data/pipeline_v2/intake.py
"""

import sys

from loaders import ALL_LOADERS, SchemaError
from schemas import ALL_SCHEMAS
from gates import gate1_intake

SCHEMAS_BY_NAME = {s.name: s for s in ALL_SCHEMAS}


def main() -> None:
    print("=" * 78)
    print("GATE 1 - INTAKE")
    print("=" * 78)

    results = []
    for name, loader in ALL_LOADERS.items():
        try:
            df = loader()
        except SchemaError as e:
            print(f"\n[FAIL] {e}")
            print("\nGate 1 failed — no further pipeline_v2 work should proceed until fixed.")
            sys.exit(1)
        results.append(gate1_intake(df, SCHEMAS_BY_NAME[name]))

    header = f"{'Source':28s} {'Rows':>10s} {'Cols':>6s} {'Year range':>14s} {'Players':>10s}"
    print()
    print(header)
    print("-" * len(header))
    for r in results:
        year_range = f"{r.year_min}-{r.year_max}" if r.year_min is not None else "n/a"
        players = f"{r.distinct_players:,}" if r.distinct_players is not None else "n/a"
        print(f"{r.name:28s} {r.rows:>10,d} {r.columns:>6d} {year_range:>14s} {players:>10s}")

    print()
    print(f"All {len(results)} sources loaded and passed Gate 1 schema assertions.")


if __name__ == "__main__":
    main()
