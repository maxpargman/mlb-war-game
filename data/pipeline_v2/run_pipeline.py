"""
run_pipeline.py — Slice 3.8: one-command pipeline refresh.

Runs the entire pipeline_v2 chain in order — this is the annual-update
ritual: refresh the raw Lahman/Baseball-Reference/Chadwick files under
data/raw/, then run this one script.

  1. intake.py             Gate 1 — schema assertions, row/year counts
  2. team_mapping.py       year-aware BR<->Lahman team mapping + roster-overlap gate
  3. war_ingestion.py      ID resolution + WAR/stat ingestion (standalone verification run)
  4. names.py              three-tier suffix resolution + spot-checks
  5. canonical_assembly.py Gates 2-3; writes canonical.parquet + reconciliation
                           report + franchise_audit.xlsx to data/canonical/
  6. view_generator.py     Gate 4; writes data/game-data.json and auto-copies
                           to app/public/game-data.json

Each stage is the exact documented command for that script (matches
running them by hand, one at a time) via subprocess, not a re-import of
their logic — this script only sequences the existing entry points and
stops at the first non-zero exit. Nothing downstream ever runs on top of
a stage that failed.

This produces fresh LOCAL files only (data/canonical/*, data/game-data.json,
app/public/game-data.json). Whether to commit/ship the result is a
separate, deliberate decision — see slice 3.9 (data swap, gated on Max's
review of the reconciliation report and a live preview).

Run with the mlbwar env active, from the repo root:
    python data/pipeline_v2/run_pipeline.py
"""

import subprocess
import sys
import time
from pathlib import Path

STAGES = [
    "intake.py",
    "team_mapping.py",
    "war_ingestion.py",
    "names.py",
    "canonical_assembly.py",
    "view_generator.py",
]

SCRIPT_DIR = Path(__file__).parent


def main() -> None:
    print("=" * 78)
    print("ONE-COMMAND PIPELINE REFRESH")
    print("=" * 78)

    for i, stage in enumerate(STAGES, start=1):
        print(f"\n{'#' * 78}")
        print(f"# STAGE {i}/{len(STAGES)}: {stage}")
        print("#" * 78)

        start = time.monotonic()
        result = subprocess.run([sys.executable, str(SCRIPT_DIR / stage)])
        elapsed = time.monotonic() - start

        if result.returncode != 0:
            print(f"\n[FAIL] Stage {i} ({stage}) exited {result.returncode} after {elapsed:.1f}s.")
            print("Refresh aborted - no downstream stage ran on top of this failure.")
            sys.exit(result.returncode)

        print(f"\n[OK] Stage {i} ({stage}) completed in {elapsed:.1f}s.")

    print("\n" + "=" * 78)
    print("REFRESH COMPLETE - all 6 stages passed.")
    print("=" * 78)
    print("Fresh local files: data/canonical/*, data/game-data.json, app/public/game-data.json")
    print("These are NOT committed automatically. Review data/canonical/reconciliation_report.txt")
    print("and data/canonical/franchise_audit.xlsx before deciding whether to ship (slice 3.9).")


if __name__ == "__main__":
    main()
