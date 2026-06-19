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

bat = bat.rename(columns={"player_ID": "playerID", "year_ID": "yearID", "team_ID": "teamID"})
pitch = pitch.rename(columns={"player_ID": "playerID", "year_ID": "yearID", "team_ID": "teamID"})

# Baseball-Reference uses different team codes than Lahman for several franchises.
# Normalize BR → Lahman so the join keys align.
BR_TO_LAHMAN = {
    "LAD": "LAN",  # Los Angeles Dodgers
    "NYM": "NYN",  # New York Mets
    "SFG": "SFN",  # San Francisco Giants
    "SDP": "SDN",  # San Diego Padres
    "KCR": "KCA",  # Kansas City Royals
    "TBR": "TBA",  # Tampa Bay Rays
    "TBD": "TBA",  # Tampa Bay Devil Rays (early)
    "CHC": "CHN",  # Chicago Cubs
    "CWS": "CHA",  # Chicago White Sox
    "FLA": "FLO",  # Florida Marlins (pre-2012)
    "WSN": "WAS",  # Washington Nationals
}
bat["teamID"] = bat["teamID"].replace(BR_TO_LAHMAN)
pitch["teamID"] = pitch["teamID"].replace(BR_TO_LAHMAN)

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
people = pd.read_csv(RAW / "People.csv")

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
