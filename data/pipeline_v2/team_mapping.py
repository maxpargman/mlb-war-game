"""
team_mapping.py — Slice 3.2: year-aware BR-code -> Lahman-team mapping.

Pipeline v1 used a hand-maintained BR_TO_LAHMAN dict that was wrong in two
ways discovered only by users noticing missing players: it had no entry at
all for the Milwaukee Brewers' 1970-1997 code (BR says "MIL" those years;
Lahman says "ML4"), and it blindly remapped every "ATH" row to the 1871-75
Philadelphia Athletics, wiping out the current Athletics' entire 2025
roster once BR started reusing "ATH" for them too.

This module replaces that dict with a table seeded directly from Lahman's
own Teams.csv `teamIDBR` column, which is already year-aware and already
correct for both of those cases (confirmed by inspection: Brewers 1970-1997
row has teamIDBR="MIL", teamID="ML4"; Athletics 2025 row has teamIDBR="ATH",
teamID="ATH", not "PH1"). No hand-maintained dict, so no missing/stale
entries — the two historical bugs become structural non-events.

Two things are verified before this mapping is trusted:
1. Every (BR code, year) pair actually appearing in the WAR files has a
   matching row here. Anything that doesn't goes to an unmapped-pairs
   report (not silently dropped).
2. For every mapped (BR code, year) belonging to one of today's 30 active
   franchises, the players BR reports for that team-year actually overlap
   heavily with Lahman's own roster for the mapped (Lahman teamID, year) —
   i.e. the mapping points at the right team, not just *a* team. Poor
   overlap on an active-franchise team-year is a hard failure with both
   rosters printed.

Known, deferred gap (Max's call, 2026-07-14): 32 Negro League team-years
(1923-1948 — none belonging to any currently-active franchise) either have
no mapping row at all or fail the roster-overlap threshold by a narrow
margin (85-89%, not near-zero). The mismatches look like the same "BR and
Lahman disagree on the 01/02 suffix for a same-surname player" issue seen
before, just in Negro League records, which are less thoroughly
cross-referenced between the two sources than modern MLB records. Since no
Negro League franchise is among the 30 active franchises the game draws
from, this can't currently reach the app. Scoped OUT of the hard-fail gate
for now and reported separately; revisit if the game ever adds historical/
Negro League franchises.

Run with the mlbwar env active, from the repo root:
    python data/pipeline_v2/team_mapping.py
"""

import sys
from pathlib import Path
import pandas as pd

from loaders import load_teams, load_teams_franchises, load_people, load_appearances, load_war_bat, load_war_pitch
from id_crosswalk import build_bbref_crosswalk

OVERLAP_THRESHOLD = 0.90
OUT_PATH = Path(__file__).parent / "team_mapping.csv"


def build_team_mapping(teams: pd.DataFrame) -> pd.DataFrame:
    """One row per (teamIDBR, yearID) -> (teamID, franchID, name). Teams.csv
    already guarantees this key is unique (verified during investigation)."""
    mapping = teams[["teamIDBR", "yearID", "teamID", "franchID", "name"]].copy()
    mapping = mapping.rename(columns={"teamIDBR": "brCode"})
    dupes = mapping.duplicated(subset=["brCode", "yearID"])
    if dupes.any():
        raise ValueError(f"Teams.csv has {dupes.sum()} duplicate (teamIDBR, yearID) pairs — mapping key is not unique")
    return mapping


def find_unmapped_br_team_years(
    bat: pd.DataFrame, pitch: pd.DataFrame, mapping: pd.DataFrame, active_franchises: set[str]
) -> pd.DataFrame:
    """BR (team_ID, year_ID) pairs with no row in the mapping table at all."""
    war_pairs = pd.concat([
        bat[["team_ID", "year_ID", "lg_ID"]],
        pitch[["team_ID", "year_ID", "lg_ID"]],
    ], ignore_index=True)

    mapped_keys = set(zip(mapping["brCode"], mapping["yearID"]))
    max_mapped_year = int(mapping["yearID"].max())
    # Codes that DO map to an active franchise in some other year — an
    # unmapped pair using one of these codes is a temporal gap (Lahman
    # hasn't added this year's row yet), not a historical/out-of-scope code.
    active_codes = set(mapping.loc[mapping["franchID"].isin(active_franchises), "brCode"])

    war_pairs["mapped"] = list(zip(war_pairs["team_ID"], war_pairs["year_ID"]))
    war_pairs["mapped"] = war_pairs["mapped"].isin(mapped_keys)
    unmapped_rows = war_pairs[~war_pairs["mapped"]]

    summary = (
        unmapped_rows.groupby(["team_ID", "year_ID"])
        .agg(rows=("lg_ID", "size"), leagues=("lg_ID", lambda s: sorted(set(s.dropna()))))
        .reset_index()
        .sort_values(["year_ID", "team_ID"])
    )
    summary["future_season"] = summary["year_ID"] > max_mapped_year
    summary["active_franchise_code"] = summary["team_ID"].isin(active_codes)
    return summary


def _bbref_to_lahman_resolver(people: pd.DataFrame):
    bbref_to_lahman = build_bbref_crosswalk(people)
    lahman_ids = set(people["playerID"])

    def resolve(bbref_id: str) -> str | None:
        if bbref_id in bbref_to_lahman:
            return bbref_to_lahman[bbref_id]
        if bbref_id in lahman_ids:
            return bbref_id
        return None

    return resolve


def compute_roster_overlap(
    mapping: pd.DataFrame,
    bat: pd.DataFrame,
    pitch: pd.DataFrame,
    appearances: pd.DataFrame,
    people: pd.DataFrame,
) -> list[dict]:
    """One result per (brCode, yearID) mapping row that has WAR-file data —
    rows with no WAR-file data for that team-year are skipped (nothing to
    verify). Each result carries the overlap ratio plus both rosters, so it
    can power both the failure report and the human-readable summary."""
    resolve = _bbref_to_lahman_resolver(people)

    br_rosters: dict[tuple[str, int], set[str]] = {}
    for df in (bat, pitch):
        for (code, year), grp in df.groupby(["team_ID", "year_ID"]):
            br_rosters.setdefault((code, year), set()).update(grp["player_ID"].tolist())

    lahman_rosters: dict[tuple[str, int], set[str]] = {}
    for (team, year), grp in appearances.groupby(["teamID", "yearID"]):
        lahman_rosters[(team, year)] = set(grp["playerID"].tolist())

    results: list[dict] = []
    for row in mapping.itertuples(index=False):
        br_ids = br_rosters.get((row.brCode, row.yearID))
        if not br_ids:
            continue

        resolved = {resolve(pid) for pid in br_ids}
        resolved.discard(None)
        lahman_ids = lahman_rosters.get((row.teamID, row.yearID), set())
        overlap_ratio = (len(resolved & lahman_ids) / len(resolved)) if resolved else 0.0

        results.append({
            "brCode": row.brCode, "yearID": row.yearID, "teamID": row.teamID, "franchID": row.franchID,
            "overlap": overlap_ratio,
            "br_roster": sorted(resolved) if resolved else sorted(br_ids),
            "lahman_roster": sorted(lahman_ids),
            "reason": (
                "none of BR's roster resolved to a Lahman playerID" if not resolved
                else f"overlap {overlap_ratio:.0%} below {OVERLAP_THRESHOLD:.0%} threshold"
            ),
        })
    return results


def partition_failures(
    results: list[dict], active_franchises: set[str], threshold: float = OVERLAP_THRESHOLD
) -> tuple[list[dict], list[dict]]:
    """Splits below-threshold results into (blocking, deferred) — only
    active-franchise team-years can block the gate; non-active-franchise
    failures (currently: Negro League, 1923-1948) are deferred per the
    scoping decision documented above."""
    blocking, deferred = [], []
    for r in results:
        if r["overlap"] >= threshold:
            continue
        (blocking if r["franchID"] in active_franchises else deferred).append(r)
    return blocking, deferred


def _print_failures(failures: list[dict]) -> None:
    for f in failures:
        print(f"  {f['brCode']} {f['yearID']} -> Lahman {f['teamID']} : {f['reason']}")
        print(f"    BR roster ({len(f['br_roster'])}):     {f['br_roster']}")
        print(f"    Lahman roster ({len(f['lahman_roster'])}): {f['lahman_roster']}")
        print()


def build_mapping_summary(
    mapping: pd.DataFrame, results: list[dict], teams_franchises: pd.DataFrame, active_franchises: set[str]
) -> str:
    """Human-readable view of the mapping table: every distinct (BR code ->
    Lahman teamID) pairing, compressed into year ranges, grouped by
    franchise, with the roster-overlap score for each range. Scoped to
    today's 30 active franchises — that's the game's actual universe, and
    matches what slice 3.6's manual audit will review."""
    overlap_by_key = {(r["brCode"], r["yearID"]): r["overlap"] for r in results}
    franch_names = teams_franchises.set_index("franchID")["franchName"].to_dict()

    active = mapping[mapping["franchID"].isin(active_franchises)].sort_values(["franchID", "yearID"])

    lines = []
    for franchID, group in sorted(active.groupby("franchID"), key=lambda kv: franch_names.get(kv[0], kv[0])):
        rows = list(group.itertuples(index=False))
        lines.append(f"{franchID} ({franch_names.get(franchID, franchID)} franchise):")

        i = 0
        while i < len(rows):
            j = i
            while (
                j + 1 < len(rows)
                and rows[j + 1].brCode == rows[i].brCode
                and rows[j + 1].teamID == rows[i].teamID
                and rows[j + 1].yearID == rows[j].yearID + 1
            ):
                j += 1

            start_year, end_year = rows[i].yearID, rows[j].yearID
            br_code, lahman_team = rows[i].brCode, rows[i].teamID
            overlaps = [overlap_by_key[(br_code, y)] for y in range(start_year, end_year + 1) if (br_code, y) in overlap_by_key]

            if overlaps:
                score = f"overlap {sum(overlaps) / len(overlaps):.1%}"
                unverified = (end_year - start_year + 1) - len(overlaps)
                if unverified:
                    score += f", {unverified} yr(s) unverified (no WAR-file data)"
            else:
                score = "no WAR-file data to verify"

            year_range = f"{start_year}" if start_year == end_year else f"{start_year}-{end_year}"
            lines.append(f'  BR "{br_code}" {year_range:<10s} -> Lahman {lahman_team:6s} ({score})')
            i = j + 1

        lines.append("")

    return "\n".join(lines)


def main() -> None:
    print("=" * 78)
    print("SLICE 3.2 - TEAM MAPPING TABLE")
    print("=" * 78)

    teams = load_teams()
    teams_franchises = load_teams_franchises()
    people = load_people()
    appearances = load_appearances()
    bat = load_war_bat()
    pitch = load_war_pitch()

    active_franchises = set(teams_franchises.loc[teams_franchises["active"] == "Y", "franchID"])
    print(f"\nActive franchises: {len(active_franchises)}")

    mapping = build_team_mapping(teams)
    print(f"Built mapping table: {len(mapping):,} (BR code, year) -> (Lahman team, year) rows.")

    print("\n--- Unmapped (BR code, year) pairs ---")
    unmapped = find_unmapped_br_team_years(bat, pitch, mapping, active_franchises)
    future = unmapped[unmapped["future_season"] & unmapped["active_franchise_code"]]
    deferred_unmapped = unmapped[~(unmapped["future_season"] & unmapped["active_franchise_code"])]
    print(f"Total unmapped pairs: {len(unmapped)}")
    print(f"  Active-franchise, future season (Lahman hasn't added this year yet): {len(future)}")
    print(f"  DEFERRED - non-active-franchise / historical code (see module docstring): {len(deferred_unmapped)}")
    if len(deferred_unmapped):
        print("\n  code   year  rows  leagues")
        for r in deferred_unmapped.itertuples(index=False):
            print(f"  {r.team_ID:6s} {r.year_ID:4d}  {r.rows:4d}  {r.leagues}")

    print("\n--- Roster-overlap verification ---")
    results = compute_roster_overlap(mapping, bat, pitch, appearances, people)
    blocking, deferred_overlap = partition_failures(results, active_franchises)
    print(f"Checked {len(results):,} mapped team-years with WAR-file data.")

    if deferred_overlap:
        print(f"\nDEFERRED - {len(deferred_overlap)} non-active-franchise team-year(s) below threshold (not gate-blocking):\n")
        _print_failures(deferred_overlap)

    if blocking:
        print(f"\n[FAIL] {len(blocking)} ACTIVE-FRANCHISE team-year(s) below the {OVERLAP_THRESHOLD:.0%} overlap threshold:\n")
        _print_failures(blocking)
        print("Gate failed - no further pipeline_v2 work should proceed until fixed.")
        sys.exit(1)

    print(f"All active-franchise team-years passed roster-overlap verification "
          f"({len(deferred_overlap)} deferred non-active-franchise team-year(s) noted above).")

    print("\n--- Human-readable mapping summary (30 active franchises) ---\n")
    print(build_mapping_summary(mapping, results, teams_franchises, active_franchises))

    mapping.to_csv(OUT_PATH, index=False)
    print(f"Wrote {OUT_PATH} ({len(mapping):,} rows) for slice 3.3 to consume.")


if __name__ == "__main__":
    main()
