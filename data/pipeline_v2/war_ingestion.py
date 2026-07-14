"""
war_ingestion.py — Slice 3.3: ID resolution + WAR ingestion + stat join.

Builds the canonical grain: one row per (bbrefID, year, Lahman teamID),
carrying batting WAR and pitching WAR as separate columns (two-way players
get BOTH populated on one row — never split here; that's a view-layer
concern per CC_PLAN.md), enriched with Lahman's playerID/name, era-accurate
team name/franchID (via slice 3.2's team mapping), Batting.csv/Pitching.csv
counting stats, and Appearances.csv's granular position-game counts.

Investigation before writing any resolution logic (see run history):
- 1,058 rows fall back from the bbrefID crosswalk to a raw-Lahman-ID match.
  These are NOT pre-1900 as pipeline v1's comments assumed — they're
  1883-1948, overwhelmingly Negro League era (same population slice 3.2
  found). PRE_LAHMAN_FALLBACK_CUTOFF is set well above the observed max
  (1948) with margin; a fallback hit past that year is treated as the
  structural error CC_PLAN.md calls for ("a modern player landing in
  fallback is an error"), not silently accepted.
- 406 rows resolve via neither path. 134 are all 2026 (this season,
  textbook Lahman-lag). Of the other 272 (historical, 1872-1948), only ONE
  belongs to a team-year that maps to an active franchise: blackve01
  ("Verne Blackbourn", 1921 CHW, 1 game, 0 PA, 0.0 WAR) — Lahman appears to
  have no record of him at all, likely a permanent, extremely marginal
  historical gap rather than a pending addition. Rather than invent a
  separate reason code for "obscure historical, will never be enriched"
  vs. "recent debut, will be enriched next release" — the ACTUAL HANDLING
  is identical either way (keep the row, name it from the WAR file's own
  name_common, no Lahman playerID) — every fully-unresolved player is
  tagged `lahman_lag` regardless of era. Flagged in the 3.3 report for
  Max's awareness; not a blocking decision given zero gameplay impact
  (WAR=0.0) and this being a single row.

Reason codes used here (subset of CC_PLAN.md's closed set — the rest
belong to later slices): resolved, pre_lahman_era, lahman_lag,
unmapped_team_year, non_mlb_league, unknown (reserved catch-all; any
non-zero count here is a bug in this module's logic, not real data, and
is treated as a hard failure).

Also found while debugging a stat-join gap here: People.csv itself has 12
bbrefID values each claimed by two different Lahman playerIDs (e.g. both
mcclubo01 [Bob McClure, 1975-1993] and mcclubo02 [an unrelated 1920s
player] list bbrefID="mcclubo01"). A naive dict-from-column would silently
keep whichever row came last — the same silent-collision failure mode this
whole rebuild targets, just found in Lahman's own crosswalk column this
time. Fixed in id_crosswalk.py (shared with team_mapping.py, which had the
same latent bug): prefer the row with a real debut date over the
undocumented duplicate. See id_crosswalk.py's docstring for detail.

Run with the mlbwar env active, from the repo root:
    python data/pipeline_v2/war_ingestion.py
"""

import sys
from pathlib import Path
import pandas as pd

from loaders import (
    load_teams, load_teams_franchises, load_people, load_appearances,
    load_batting, load_pitching, load_war_bat, load_war_pitch,
)
from team_mapping import build_team_mapping
from id_crosswalk import build_bbref_crosswalk, find_bbref_duplicates

PRE_LAHMAN_FALLBACK_CUTOFF = 1960  # observed fallback rows max out at 1948

# Batting.csv and Pitching.csv share 11 raw column names (G, H, HR, BB, SO,
# IBB, HBP, SH, SF, GIDP, R) with different meanings in each (e.g. "G" is
# games played vs. games pitched) — every stat column gets an explicit
# bat_/pitch_ prefix on output so nothing is ambiguous or silently
# overwritten by pandas' automatic merge-suffix behavior.
BATTING_STAT_COLS = ["G", "AB", "R", "H", "2B", "3B", "HR", "RBI", "SB", "CS", "BB", "SO", "IBB", "HBP", "SH", "SF", "GIDP"]
PITCHING_STAT_COLS = ["W", "L", "G", "GS", "CG", "SHO", "SV", "IPouts", "H", "ER", "HR", "BB", "SO", "IBB", "WP", "HBP", "BK", "BFP", "GF", "R", "SH", "SF", "GIDP"]
APPEARANCE_COLS = ["G_all", "G_p", "G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_lf", "G_cf", "G_rf", "G_of", "G_dh"]

BAT_OUT_COLS = [f"bat_{c}" for c in BATTING_STAT_COLS]
PITCH_OUT_COLS = [f"pitch_{c}" for c in PITCHING_STAT_COLS]

OUT_DIR = Path(__file__).parent
CANONICAL_OUT = OUT_DIR / "war_ingested.csv"
EXCEPTIONS_OUT = OUT_DIR / "war_ingestion_exceptions.csv"

MLB_LEAGUES = {"NL", "AL", "AA", "UA", "PL", "FL"}  # non-null, non-Negro-League codes seen in Teams.csv


def build_war_grain(bat: pd.DataFrame, pitch: pd.DataFrame) -> pd.DataFrame:
    """One row per (bbrefID, year, BR team code), stints summed within each.
    Carries battingWAR/pitchingWAR as separate columns and name_common (for
    lahman_lag naming) plus lg_ID (for non_mlb_league classification)."""
    bat_agg = (
        bat.groupby(["player_ID", "year_ID", "team_ID"], as_index=False)
        .agg(battingWAR=("WAR", "sum"), name_common=("name_common", "first"), lg_ID=("lg_ID", "first"))
    )
    pitch_agg = (
        pitch.groupby(["player_ID", "year_ID", "team_ID"], as_index=False)
        .agg(pitchingWAR=("WAR", "sum"), name_common=("name_common", "first"), lg_ID=("lg_ID", "first"))
    )

    grain = bat_agg.merge(
        pitch_agg, on=["player_ID", "year_ID", "team_ID"], how="outer", suffixes=("", "_p")
    )
    grain["name_common"] = grain["name_common"].fillna(grain.pop("name_common_p"))
    grain["lg_ID"] = grain["lg_ID"].fillna(grain.pop("lg_ID_p"))
    grain = grain.rename(columns={"player_ID": "bbrefID", "year_ID": "year", "team_ID": "brCode"})
    return grain


def resolve_teams(grain: pd.DataFrame, mapping: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Attaches lahmanTeamID/franchID/era-accurate team name via slice 3.2's
    mapping. Rows whose (brCode, year) has no mapping can't be placed on the
    canonical grain at all — split off into an excluded set with a reason."""
    merged = grain.merge(
        mapping.rename(columns={"yearID": "year"}),
        on=["brCode", "year"], how="left",
    )
    unmapped_mask = merged["teamID"].isna()
    resolved = merged[~unmapped_mask].copy()
    excluded = merged[unmapped_mask].copy()
    excluded["reason"] = excluded["lg_ID"].apply(
        lambda lg: "non_mlb_league" if pd.notna(lg) and lg not in MLB_LEAGUES else "unmapped_team_year"
    )
    resolved = resolved.rename(columns={"teamID": "lahmanTeamID", "name": "teamName"})
    return resolved, excluded


def _player_resolver(people: pd.DataFrame):
    bbref_to_lahman = build_bbref_crosswalk(people)
    lahman_ids = set(people["playerID"])
    name_by_id = people.set_index("playerID")[["nameFirst", "nameLast"]].to_dict(orient="index")

    def resolve(bbref_id: str, year: int, name_common: str) -> dict:
        if bbref_id in bbref_to_lahman:
            pid = bbref_to_lahman[bbref_id]
            n = name_by_id[pid]
            return {"lahmanPlayerID": pid, "resolutionReason": "resolved", "nameFirst": n["nameFirst"], "nameLast": n["nameLast"]}
        if bbref_id in lahman_ids:
            if year > PRE_LAHMAN_FALLBACK_CUTOFF:
                raise RuntimeError(
                    f"Modern player ({bbref_id}, {year}) resolved only via the raw-Lahman-ID fallback — "
                    f"this is supposed to be impossible past {PRE_LAHMAN_FALLBACK_CUTOFF} and needs investigation, "
                    f"not silent acceptance."
                )
            n = name_by_id[bbref_id]
            return {"lahmanPlayerID": bbref_id, "resolutionReason": "pre_lahman_era", "nameFirst": n["nameFirst"], "nameLast": n["nameLast"]}
        parts = str(name_common).rsplit(" ", 1)
        first, last = (parts[0], parts[1]) if len(parts) == 2 else ("", name_common)
        return {"lahmanPlayerID": None, "resolutionReason": "lahman_lag", "nameFirst": first, "nameLast": last}

    return resolve


def resolve_players(df: pd.DataFrame, people: pd.DataFrame) -> pd.DataFrame:
    resolve = _player_resolver(people)
    resolved = df.apply(lambda r: resolve(r["bbrefID"], r["year"], r["name_common"]), axis=1, result_type="expand")
    return pd.concat([df.reset_index(drop=True), resolved.reset_index(drop=True)], axis=1)


def attach_stats(
    df: pd.DataFrame, batting: pd.DataFrame, pitching: pd.DataFrame, appearances: pd.DataFrame
) -> pd.DataFrame:
    bat_agg = batting.groupby(["playerID", "yearID", "teamID"], as_index=False)[BATTING_STAT_COLS].sum()
    bat_agg = bat_agg.rename(columns=dict(zip(BATTING_STAT_COLS, BAT_OUT_COLS)))

    pitch_agg = pitching.groupby(["playerID", "yearID", "teamID"], as_index=False)[PITCHING_STAT_COLS].sum()
    pitch_agg = pitch_agg.rename(columns=dict(zip(PITCHING_STAT_COLS, PITCH_OUT_COLS)))

    # Appearances.csv has no stint column — already one row per player/year/team.
    app_cols = appearances[["playerID", "yearID", "teamID"] + APPEARANCE_COLS]

    out = df.merge(
        bat_agg, left_on=["lahmanPlayerID", "year", "lahmanTeamID"], right_on=["playerID", "yearID", "teamID"],
        how="left",
    ).drop(columns=["playerID", "yearID", "teamID"], errors="ignore")

    out = out.merge(
        pitch_agg, left_on=["lahmanPlayerID", "year", "lahmanTeamID"], right_on=["playerID", "yearID", "teamID"],
        how="left",
    ).drop(columns=["playerID", "yearID", "teamID"], errors="ignore")

    out = out.merge(
        app_cols, left_on=["lahmanPlayerID", "year", "lahmanTeamID"], right_on=["playerID", "yearID", "teamID"],
        how="left",
    ).drop(columns=["playerID", "yearID", "teamID"], errors="ignore")

    return out


def main() -> None:
    print("=" * 78)
    print("SLICE 3.3 - ID RESOLUTION + WAR/STAT INGESTION")
    print("=" * 78)

    teams = load_teams()
    teams_franchises = load_teams_franchises()
    people = load_people()
    appearances = load_appearances()
    batting = load_batting()
    pitching = load_pitching()
    bat = load_war_bat()
    pitch = load_war_pitch()
    mapping = build_team_mapping(teams)
    active_franchises = set(teams_franchises.loc[teams_franchises["active"] == "Y", "franchID"])

    dupes = find_bbref_duplicates(people)
    if len(dupes):
        print(f"\nPeople.csv bbrefID collisions found: {dupes['bbrefID'].nunique()} bbrefID value(s), "
              f"{len(dupes)} rows. Resolved by preferring the row with a real debut date "
              f"(see id_crosswalk.py). Affected bbrefIDs: {sorted(dupes['bbrefID'].unique().tolist())}")

    grain = build_war_grain(bat, pitch)
    print(f"\nWAR grain (bbrefID, year, BR team code), stints summed: {len(grain):,} rows")

    resolved, team_excluded = resolve_teams(grain, mapping)
    print(f"Team-resolved: {len(resolved):,}   Team-unresolved (excluded): {len(team_excluded):,}")
    if len(team_excluded):
        reason_counts = team_excluded["reason"].value_counts()
        for reason, count in reason_counts.items():
            print(f"    {reason:20s} {count:5d}")

    resolved = resolve_players(resolved, people)
    reason_counts = resolved["resolutionReason"].value_counts()
    print("\nPlayer ID resolution:")
    for reason, count in reason_counts.items():
        print(f"    {reason:20s} {count:6,d}")

    unknown_count = int((resolved["resolutionReason"] == "unknown").sum())
    if unknown_count:
        print(f"\n[FAIL] {unknown_count} rows landed in the 'unknown' reason bucket - this should be impossible "
              f"with the current resolution logic and indicates a real bug, not a data gap.")
        sys.exit(1)

    final = attach_stats(resolved, batting, pitching, appearances)

    # Stat-join visibility: WAR exists but no matching Batting/Pitching row,
    # for rows where a Lahman playerID WAS available (so a match was
    # possible at all). Reported, not silently dropped or NULLed away.
    has_bat_war = final["battingWAR"].notna()
    has_pitch_war = final["pitchingWAR"].notna()
    resolvable = final["lahmanPlayerID"].notna()
    no_batting_match = resolvable & has_bat_war & final["bat_G"].isna()
    no_pitching_match = resolvable & has_pitch_war & final["pitch_W"].isna()
    print(f"\nStat-join gaps (WAR present, Lahman ID resolved, no matching stat row):")
    print(f"    Batting.csv:  {no_batting_match.sum():,}")
    print(f"    Pitching.csv: {no_pitching_match.sum():,}")

    # Note: this counts every row with a value in both WAR columns, which is
    # NOT the same as "genuinely two-way like Ohtani" — pre-DH-era pitchers
    # routinely have a small (often near-zero) batting WAR just from their
    # own plate appearances. That's correct, real data (verified: Ohtani's
    # own rows show substantial values on both sides, not swapped/corrupted;
    # deciding what counts as "meaningfully two-way" for gameplay purposes
    # is a view-layer decision, not this slice's job).
    print(f"\nRows with a value in both WAR columns (includes pitchers' incidental batting, "
          f"not just Ohtani-style two-way players): {(has_bat_war & has_pitch_war).sum():,}")

    # Conservation check (Gate 2 preview): every WAR grain row is either in
    # the canonical output or the team-exceptions table — nothing else.
    rows_in = len(grain)
    rows_out = len(final)
    rows_excluded = len(team_excluded)
    print(f"\n--- Conservation check ---")
    print(f"rows_in ({rows_in:,}) == rows_out ({rows_out:,}) + rows_excluded ({rows_excluded:,})"
          f"  ->  {rows_in == rows_out + rows_excluded}")
    if rows_in != rows_out + rows_excluded:
        print("[FAIL] Conservation check failed - rows were lost or duplicated somewhere in this module.")
        sys.exit(1)

    active_count = (final["franchID"].isin(active_franchises)).sum()
    print(f"\nActive-franchise rows in canonical output: {active_count:,} of {rows_out:,}")

    final.to_csv(CANONICAL_OUT, index=False)
    team_excluded.to_csv(EXCEPTIONS_OUT, index=False)
    print(f"\nWrote {CANONICAL_OUT} ({rows_out:,} rows)")
    print(f"Wrote {EXCEPTIONS_OUT} ({rows_excluded:,} rows)")


if __name__ == "__main__":
    main()
