"""
view_generator.py — Slice 3.7: config-driven Parquet -> game-data.json.

Reads data/canonical/canonical.parquet (slice 3.5's output) and emits the
static game-data.json the app loads, applying every game-design choice
from view_config.yaml. Changing presentation (a DH slot, an LF/CF/RF
split, a franchise display-name fix) should only ever require editing
that config file, never this script.

Position-version derivation (mirrors pipeline v1's already-validated
logic, now built on the canonical layer):
  1. primaryPos = argmax over [G_p, G_c, G_1b, G_2b, G_3b, G_ss, G_of]
     (deliberately excludes G_dh -- there is no DH slot in this game).
     All-zero (every game that season was DH/PH/PR) -> excluded,
     reason dh_only_season.
  2. If primaryPos == 'P': base version = P, pitchingWAR.
     Else: base version = primaryPos, battingWAR.
  3. Two-way addition (only when primaryPos == 'P' and battingWAR is also
     present): hitPos = argmax over [G_c, G_1b, G_2b, G_3b, G_ss, G_of]
     (excludes G_p this time -- the hitting-side position). If non-zero,
     ADD a second position-version at hitPos using battingWAR.
     Verified against Ohtani 2021 (G_p=23, G_of=7, G_dh=126, not a
     candidate): primaryPos is 'P' since 23 > 7 -- DH games don't count --
     giving a base P version (pitchingWAR 4.07); the two-way addition
     gives OF (battingWAR 4.89), matching the original acceptance-test
     values exactly.
  There is deliberately no symmetric addition for position players with
  incidental pitching WAR (e.g. a modern "position player pitching"
  mop-up outing) -- pipeline v1 never did this either, and offering, say,
  a career outfielder as a pitcher because of one blowout inning would be
  a degenerate game entry, not a real two-way option.

Gate 4 (view reconciliation): canonical rows in == emitted position-
version rows out + excluded-with-reason (expected: dh_only_season,
inactive_franchise). Emitted JSON invariants checked: exactly 30
franchises, all 7 position codes present, size <= ~3.5 MB gzipped,
embedded build stamp (date + a content hash of the canonical Parquet).

Run with the mlbwar env active, from the repo root:
    python data/pipeline_v2/view_generator.py
"""

import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

CONFIG_PATH = Path(__file__).parent / "view_config.yaml"
CANONICAL_PATH = Path(__file__).parent.parent / "canonical" / "canonical.parquet"
REPO_ROOT = Path(__file__).parent.parent.parent
DATA_OUT = REPO_ROOT / "data" / "game-data.json"
APP_PUBLIC_OUT = REPO_ROOT / "app" / "public" / "game-data.json"

POS_COLS_ALL = ["G_p", "G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_of"]
POS_LABELS_ALL = ["P", "C", "1B", "2B", "3B", "SS", "OF"]
POS_COLS_NO_P = ["G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_of"]
POS_LABELS_NO_P = ["C", "1B", "2B", "3B", "SS", "OF"]
EXPECTED_POS_CODES = {"C", "1B", "2B", "3B", "SS", "OF", "P"}


def load_config() -> dict:
    return yaml.safe_load(CONFIG_PATH.read_text(encoding="utf-8"))


def _primary_position(df: pd.DataFrame, cols: list[str], labels: list[str]) -> pd.Series:
    mat = df[cols].fillna(0)
    mat.columns = labels
    primary = mat.idxmax(axis=1)
    primary[mat.max(axis=1) == 0] = None
    return primary


def derive_position_versions(canonical: pd.DataFrame, config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    df = canonical.copy()
    df["primaryPosAll"] = _primary_position(df, POS_COLS_ALL, POS_LABELS_ALL)
    df["hitPosNoP"] = _primary_position(df, POS_COLS_NO_P, POS_LABELS_NO_P)

    excluded_rows = []
    version_rows = []

    dh_only = df["primaryPosAll"].isna()
    for row in df[dh_only].itertuples(index=False):
        excluded_rows.append({"bbrefID": row.bbrefID, "year": row.year, "franchID": row.franchID, "reason": "dh_only_season"})

    active = df[~dh_only]

    is_pitcher = active["primaryPosAll"] == "P"

    base_pitch = active[is_pitcher]
    base_pitch_ok = base_pitch["pitchingWAR"].notna()
    for row in base_pitch[base_pitch_ok].itertuples(index=False):
        version_rows.append(_version_row(row, "P", row.pitchingWAR, is_base=True))
    for row in base_pitch[~base_pitch_ok].itertuples(index=False):
        excluded_rows.append({"bbrefID": row.bbrefID, "year": row.year, "franchID": row.franchID, "reason": "primary_pos_war_missing"})

    base_bat = active[~is_pitcher]
    base_bat_ok = base_bat["battingWAR"].notna()
    for row in base_bat[base_bat_ok].itertuples(index=False):
        version_rows.append(_version_row(row, row.primaryPosAll, row.battingWAR, is_base=True))
    for row in base_bat[~base_bat_ok].itertuples(index=False):
        excluded_rows.append({"bbrefID": row.bbrefID, "year": row.year, "franchID": row.franchID, "reason": "primary_pos_war_missing"})

    if config.get("two_way_splitting", True):
        two_way_candidates = base_pitch[base_pitch_ok]
        two_way_candidates = two_way_candidates[two_way_candidates["battingWAR"].notna() & two_way_candidates["hitPosNoP"].notna()]
        for row in two_way_candidates.itertuples(index=False):
            version_rows.append(_version_row(row, row.hitPosNoP, row.battingWAR, is_base=False))

    versions = pd.DataFrame(version_rows)
    excluded = pd.DataFrame(excluded_rows)
    return versions, excluded


def _version_row(row, pos: str, war: float, is_base: bool) -> dict:
    return {
        "bbrefID": row.bbrefID,
        "displayName": row.displayName,
        "franchID": row.franchID,
        "teamName": row.teamName,
        "year": row.year,
        "pos": pos,
        "war": war,
        "isBase": is_base,
    }


def apply_franchise_filter(versions: pd.DataFrame, active_franchises: set[str], config: dict) -> tuple[pd.DataFrame, pd.DataFrame]:
    if not config.get("active_franchises_only", True):
        return versions, pd.DataFrame(columns=["bbrefID", "year", "franchID", "isBase", "reason"])
    keep_mask = versions["franchID"].isin(active_franchises)
    kept = versions[keep_mask]
    excluded = versions[~keep_mask][["bbrefID", "year", "franchID", "isBase"]].copy()
    excluded["reason"] = "inactive_franchise"
    return kept, excluded


def apply_franchise_name_overrides(versions: pd.DataFrame, franch_names: dict[str, str], config: dict) -> pd.DataFrame:
    overrides = config.get("franchise_name_overrides", {}) or {}
    display = dict(franch_names)
    display.update(overrides)
    versions = versions.copy()
    versions["franchiseName"] = versions["franchID"].map(display)
    return versions


def build_stamp(canonical_path: Path) -> str:
    content_hash = hashlib.sha256(canonical_path.read_bytes()).hexdigest()[:12]
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"{date}-{content_hash}"


def gate4_checks(
    canonical: pd.DataFrame, final_versions: pd.DataFrame, stage1_excluded: pd.DataFrame,
    stage2_excluded: pd.DataFrame, records: list[dict], gzipped_size: int,
) -> dict:
    """Precise conservation: every canonical row produces exactly one BASE
    outcome (a base version-row or an exclusion) -- two-way addition rows
    are bonus emissions on top of an already-accounted-for base row, so
    they're deliberately excluded from this count."""
    rows_in = len(canonical)
    base_emitted = int(final_versions["isBase"].sum())
    base_excluded_stage1 = len(stage1_excluded)
    base_excluded_stage2 = int(stage2_excluded["isBase"].sum()) if len(stage2_excluded) else 0
    conserved = rows_in == base_emitted + base_excluded_stage1 + base_excluded_stage2

    franchise_count = len({r["fid"] for r in records})
    pos_codes = {r["pos"] for r in records}

    checks = {
        "base_row_conservation": conserved,
        "franchise_count_30": franchise_count == 30,
        "all_pos_codes_present": EXPECTED_POS_CODES.issubset(pos_codes),
        "size_under_3_5mb_gzipped": gzipped_size <= 3_500_000,
    }
    return {
        "rows_in": rows_in, "base_emitted": base_emitted,
        "base_excluded_stage1": base_excluded_stage1, "base_excluded_stage2": base_excluded_stage2,
        "total_records": len(records),
        "franchise_count": franchise_count, "pos_codes": sorted(pos_codes),
        "gzipped_size": gzipped_size, "checks": checks,
        "overall_ok": all(checks.values()),
    }


def main() -> None:
    print("=" * 78)
    print("SLICE 3.7 - VIEW GENERATOR")
    print("=" * 78)

    if not CANONICAL_PATH.exists():
        print(f"\n[FAIL] {CANONICAL_PATH} not found - run canonical_assembly.py (slice 3.5) first.")
        sys.exit(1)

    config = load_config()
    canonical = pd.read_parquet(CANONICAL_PATH)
    print(f"\nCanonical rows loaded: {len(canonical):,}")

    versions, stage1_excluded = derive_position_versions(canonical, config)
    print(f"Position-version rows derived: {len(versions):,}")
    print(f"DH-only / missing-WAR exclusions: {len(stage1_excluded):,}")
    if len(stage1_excluded):
        print(stage1_excluded["reason"].value_counts().to_string())

    teams = pd.read_csv(Path(__file__).parent.parent / "raw" / "Teams.csv", low_memory=False)
    teams_franchises = pd.read_csv(Path(__file__).parent.parent / "raw" / "TeamsFranchises.csv", low_memory=False)
    active_franchises = set(teams_franchises.loc[teams_franchises["active"] == "Y", "franchID"])
    most_recent_name = (
        teams[teams["franchID"].isin(active_franchises)]
        .sort_values("yearID").groupby("franchID")["name"].last().to_dict()
    )

    versions, stage2_excluded = apply_franchise_filter(versions, active_franchises, config)
    print(f"Inactive-franchise exclusions: {len(stage2_excluded):,}")

    versions = apply_franchise_name_overrides(versions, most_recent_name, config)

    records = (
        versions.rename(columns={
            "bbrefID": "id", "displayName": "n", "franchID": "fid",
            "franchiseName": "fn", "year": "y", "pos": "pos", "war": "war",
        })[["id", "n", "fid", "fn", "y", "pos", "war"]]
        .to_dict(orient="records")
    )

    json_bytes = json.dumps(records, separators=(",", ":")).encode("utf-8")
    gzipped_size = len(gzip.compress(json_bytes))
    print(f"\nEmitted {len(records):,} records, {len(json_bytes):,} bytes uncompressed, {gzipped_size:,} bytes gzipped")

    gate4 = gate4_checks(canonical, versions, stage1_excluded, stage2_excluded, records, gzipped_size)
    print("\n--- Gate 4 ---")
    print(f"  Base-row conservation: rows_in ({gate4['rows_in']:,}) == base_emitted ({gate4['base_emitted']:,}) "
          f"+ stage1_excluded ({gate4['base_excluded_stage1']:,}) + stage2_excluded ({gate4['base_excluded_stage2']:,})"
          f"  -> {gate4['checks']['base_row_conservation']}")
    print(f"  Total records emitted (incl. two-way additions): {gate4['total_records']:,}")
    for name, ok in gate4["checks"].items():
        if name == "base_row_conservation":
            continue
        print(f"  {'PASS' if ok else 'FAIL'}  {name}  (franchises={gate4['franchise_count']}, "
              f"pos_codes={gate4['pos_codes']}, gzipped={gate4['gzipped_size']:,}B)")

    if not gate4["overall_ok"]:
        print("\nGate 4 failed - no game-data.json written.")
        sys.exit(1)

    stamp = build_stamp(CANONICAL_PATH)
    # The app expects a bare array (see app/src/data.ts's Season[] type) --
    # the build stamp is embedded as a sidecar file instead of changing the
    # app's data contract.
    DATA_OUT.write_text(json.dumps(records, separators=(",", ":")), encoding="utf-8")
    APP_PUBLIC_OUT.write_text(json.dumps(records, separators=(",", ":")), encoding="utf-8")
    stamp_path = DATA_OUT.parent / "game-data.buildstamp.json"
    stamp_path.write_text(json.dumps({"buildStamp": stamp, "canonicalPath": str(CANONICAL_PATH), "rowCount": len(records)}, indent=2), encoding="utf-8")

    print(f"\nBuild stamp: {stamp}")
    print(f"Wrote {DATA_OUT}")
    print(f"Wrote {APP_PUBLIC_OUT}  (auto-copied)")
    print(f"Wrote {stamp_path}")


if __name__ == "__main__":
    main()
