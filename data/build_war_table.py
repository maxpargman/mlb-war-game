"""
build_war_table.py

Joins batting and pitching WAR onto the primary-position table produced by
build_positions.py. Two-way players (those with entries in both WAR files
for the same season/team/stint) get two rows: one pitching version and one
hitting version. The hitting version's position is re-derived from Appearances
excluding pitcher games.

Writes data/war_positions.csv with columns:
    playerID, yearID, teamID, pos_version, WAR

Run with the mlbwar env active:
    python data\\build_war_table.py
"""

from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / "raw"
DATA = Path(__file__).parent

POS_COLS_NO_P = ["G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_of"]
POS_LABELS_NO_P = ["C", "1B", "2B", "3B", "SS", "OF"]

# --- Load ---
positions = pd.read_csv(DATA / "positions.csv")
bat = pd.read_csv(RAW / "war_daily_bat.txt", na_values="NULL", low_memory=False)
pitch = pd.read_csv(RAW / "war_daily_pitch.txt", na_values="NULL", low_memory=False)
app = pd.read_csv(RAW / "Appearances.csv")
people = pd.read_csv(RAW / "People.csv")

bat = bat.rename(columns={"player_ID": "playerID", "year_ID": "yearID", "team_ID": "teamID"})
pitch = pitch.rename(columns={"player_ID": "playerID", "year_ID": "yearID", "team_ID": "teamID"})

# --- Resolve WAR-file player IDs (Baseball-Reference's own bbrefID scheme) to
# Lahman's playerID scheme ---
# The two ID schemes usually look identical, but diverge for: (a) players known
# by initials, where BR keeps the period ("burnea.01") and Lahman doesn't
# ("burneaj01"), (b) apostrophes in names, and (c) same-surname pairs where BR
# and Lahman assigned the "01"/"02" suffix in opposite order (e.g. Lahman's
# allento01 is Todd Allen, but Todd Allen's own bbrefID is allento02 — a naive
# string-equality join silently swaps these two players' stats). People.csv's
# bbrefID column is the authoritative crosswalk; fall back to treating the ID
# as already-Lahman-format only when it isn't a known bbrefID (mostly very old
# 19th-century players absent from bbrefID coverage).
_bbref_to_lahman = people.dropna(subset=["bbrefID"]).set_index("bbrefID")["playerID"].to_dict()
_lahman_ids = set(people["playerID"])


def resolve_lahman_id(bbref_id: str):
    if bbref_id in _bbref_to_lahman:
        return _bbref_to_lahman[bbref_id]
    if bbref_id in _lahman_ids:
        return bbref_id
    return None  # not in Lahman at all (too new, or too obscure) — drops out downstream


bat["playerID"] = bat["playerID"].map(resolve_lahman_id)
pitch["playerID"] = pitch["playerID"].map(resolve_lahman_id)

# Baseball-Reference uses different team codes than Lahman for many franchises.
# Auto-generated crosswalk by matching playerID+yearID across both sources.
# NOTE: "ATH" is ambiguous — BR used it for the 1871-1875 Philadelphia Athletics
# *and* reused it in 2025 for the current Athletics (after they dropped "Oakland"
# from the name). Lahman itself already uses "ATH" for the modern team, so the
# crosswalk below must only apply to the historical (pre-2025) rows.
BR_TO_LAHMAN = {
    "AC": "ACB",
    "AG": "ACG",
    "ATH": "PH1",
    "BRA": "BR2",
    "BTT": "BRF",
    "BUF": "BFN",
    "BWW": "BRP",
    "CC": "CIC",
    "CEN": "PH3",
    "CHC": "CHN",
    "CHI": "CHF",
    "CHW": "CHA",
    "CKK": "CN3",
    "CLV": "CL4",
    "COR": "CNU",
    "CPI": "CHU",
    "ECK": "BR1",
    "FLA": "FLO",
    "HAR": "HR1",
    "IC": "CIC",
    "IND": "IN3",
    "KCA": "KC1",
    "KCC": "KC2",
    "KCP": "KCF",
    "KCR": "KCA",
    "KEK": "FW1",
    "LAD": "LAN",
    "LOU": "LS3",
    "MAN": "MID",
    "MAR": "BL4",
    "MLG": "ML2",
    "MLN": "ML1",
    "NAT": "WS4",
    "NHV": "NH1",
    "NYG": "NY1",
    "NYI": "NYP",
    "NYM": "NYN",
    "NYP": "NY4",
    "NYU": "NY2",
    "NYY": "NYA",
    "OLY": "WS3",
    "PBB": "PTP",
    "PBS": "PTF",
    "PHK": "PHU",
    "PHQ": "PHP",
    "RES": "ELI",
    "ROC": "RC2",
    "ROK": "RC1",
    "SDP": "SDN",
    "SEP": "SE1",
    "SFG": "SFN",
    "SLB": "SLA",
    "SLM": "SLF",
    "SLR": "SL1",
    "STL": "SLN",
    "STP": "SPU",
    "SYR": "SR2",
    "TBD": "TBA",
    "TBR": "TBA",
    "TC": "TIC",
    "TOL": "TL1",
    "TRO": "TRN",
    "WAS": "WS9",
    "WES": "KEO",
    "WHS": "WAS",
    "WSA": "WS2",
    "WSH": "WS1",
    "WSN": "WAS",
}
def apply_team_crosswalk(df: pd.DataFrame) -> None:
    modern_ath = (df["teamID"] == "ATH") & (df["yearID"] >= 2025)
    df.loc[~modern_ath, "teamID"] = df.loc[~modern_ath, "teamID"].replace(BR_TO_LAHMAN)


apply_team_crosswalk(bat)
apply_team_crosswalk(pitch)

JOIN_KEYS = ["playerID", "yearID", "teamID", "stint_ID"]
bat_key = bat[JOIN_KEYS + ["WAR"]].copy()
pitch_key = pitch[JOIN_KEYS + ["WAR"]].copy()

# --- Identify two-way player stints ---
two_way = pd.merge(
    pitch_key[JOIN_KEYS],
    bat_key[JOIN_KEYS],
    on=JOIN_KEYS,
)  # rows that exist in both files

# --- Hitting position for two-way players (exclude pitcher games) ---
for col in POS_COLS_NO_P:
    app[col] = app[col].fillna(0)
pos_matrix_no_p = app[POS_COLS_NO_P].copy()
pos_matrix_no_p.columns = POS_LABELS_NO_P
app["hit_pos"] = pos_matrix_no_p.idxmax(axis=1)
app.loc[pos_matrix_no_p.max(axis=1) == 0, "hit_pos"] = None
# Appearances has no stint_ID; we join on player/year/team only
hit_pos_map = app[["playerID", "yearID", "teamID", "hit_pos"]].drop_duplicates(
    subset=["playerID", "yearID", "teamID"]
)

# --- 1. Non-pitcher position players → batting WAR ---
non_pitchers = positions[positions["primary_pos"] != "P"].copy()
# positions has no stint_ID, so join on player/year/team and take the sum of
# WAR across stints (mid-season trades: we keep all stints so per-team WAR
# is preserved by teamID; slice 1.4 will refine franchise mapping)
bat_agg = bat_key.groupby(["playerID", "yearID", "teamID"], as_index=False)["WAR"].sum()
part_bat = non_pitchers.merge(bat_agg, on=["playerID", "yearID", "teamID"], how="left")
part_bat = part_bat.rename(columns={"primary_pos": "pos_version"})
part_bat = part_bat[["playerID", "yearID", "teamID", "pos_version", "WAR"]]

# --- 2. Pitchers → pitching WAR ---
pitchers = positions[positions["primary_pos"] == "P"].copy()
pitch_agg = pitch_key.groupby(["playerID", "yearID", "teamID"], as_index=False)["WAR"].sum()
part_pitch = pitchers.merge(pitch_agg, on=["playerID", "yearID", "teamID"], how="left")
part_pitch = part_pitch.rename(columns={"primary_pos": "pos_version"})
part_pitch = part_pitch[["playerID", "yearID", "teamID", "pos_version", "WAR"]]

# --- 3. Two-way hitting rows ---
# For each two-way stint, add a hitting row using batting WAR and the
# non-pitcher primary position.
two_way_agg = (
    two_way.merge(bat_key, on=JOIN_KEYS, how="left")
    .groupby(["playerID", "yearID", "teamID"], as_index=False)["WAR"].sum()
)
two_way_hit = two_way_agg.merge(hit_pos_map, on=["playerID", "yearID", "teamID"], how="left")
two_way_hit = two_way_hit.rename(columns={"hit_pos": "pos_version"})
two_way_hit = two_way_hit[["playerID", "yearID", "teamID", "pos_version", "WAR"]]
two_way_hit = two_way_hit.dropna(subset=["pos_version"])

# --- Combine ---
result = pd.concat([part_bat, part_pitch, two_way_hit], ignore_index=True)
result = result.dropna(subset=["WAR"])
result.to_csv(DATA / "war_positions.csv", index=False)
print(f"Wrote {len(result):,} rows to war_positions.csv")

# --- Spot checks ---
def get_pid(first, last):
    return people[(people["nameFirst"] == first) & (people["nameLast"] == last)]["playerID"].iloc[0]

def show(first, last, team=None):
    pid = get_pid(first, last)
    rows = result[result["playerID"] == pid]
    if team:
        rows = rows[rows["teamID"] == team]
    print(f"\n{first} {last}{' @ ' + team if team else ''}:")
    print(rows.sort_values(["yearID", "pos_version"]).to_string(index=False))

print("\n" + "=" * 60)
print("SPOT CHECKS")
print("=" * 60)
show("Bryce", "Harper", "PHI")
show("Shohei", "Ohtani")
show("Mike", "Piazza")
show("Roy", "Halladay")
show("Nick", "Kurtz", "ATH")
show("A. J.", "Burnett")
show("R. A.", "Dickey")
