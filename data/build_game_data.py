"""
build_game_data.py

Reads the intermediate pipeline files, applies the minimum-games filter,
joins player names, and writes data/game-data.json — the single static
file the web app loads.

Schema (one record per player / franchise / year / position-version):
  {
    "id":   "harpebr03",      # playerID
    "n":    "Bryce Harper",   # full name
    "fid":  "PHI",            # franchID
    "fn":   "Philadelphia Phillies",  # franchise_name
    "y":    2021,             # yearID
    "pos":  "OF",             # position version
    "war":  5.85              # bWAR
  }

Compact keys keep the file under ~5 MB uncompressed (~1.5 MB gzipped).

Filtering rule:
  - Position players (pos != P): G_all >= 50  (meaningful role-player season)
  - Pitchers          (pos == P): G_all >= 25  (captures 25+ start SP seasons)

Run with the mlbwar env active:
    python data\\build_game_data.py
"""

import json
from pathlib import Path
import pandas as pd

RAW  = Path(__file__).parent / "raw"
DATA = Path(__file__).parent

# --- Load intermediate data ---
war = pd.read_csv(DATA / "war_positions.csv")   # has franchID, franchise_name
pos = pd.read_csv(DATA / "positions.csv")        # has G_all
teams = pd.read_csv(RAW / "Teams.csv", low_memory=False)
tf    = pd.read_csv(RAW / "TeamsFranchises.csv")
people = pd.read_csv(RAW / "People.csv")

# --- Fix franchise join: use (teamID, yearID) so old reused codes resolve correctly ---
# Re-derive franchID + franchise_name from scratch using the year-aware lookup.
active_franchises = set(tf[tf["active"] == "Y"]["franchID"])

# Most-recent name per active franchise
most_recent_name = (
    teams[teams["franchID"].isin(active_franchises)]
    .sort_values("yearID")
    .groupby("franchID")["name"]
    .last()
    .to_dict()
)

# Year-aware teamID → franchID (one row per teamID/yearID)
team_year_franch = teams[["teamID", "yearID", "franchID"]].copy()

# Drop old franchise columns and re-join with year precision
war = war.drop(columns=[c for c in ["franchID", "franchise_name"] if c in war.columns])
war = war.merge(team_year_franch, on=["teamID", "yearID"], how="left")

# Filter to active franchises only
war = war[war["franchID"].isin(active_franchises)].copy()

# --- Attach G_all from positions ---
# positions.csv has one row per (playerID, yearID, teamID); merge on all three.
war = war.merge(
    pos[["playerID", "yearID", "teamID", "G_all"]],
    on=["playerID", "yearID", "teamID"],
    how="left",
)

# --- Apply minimum-games filter ---
pitcher_mask = war["pos_version"] == "P"
keep = (
    (~pitcher_mask & (war["G_all"] >= 50)) |
    ( pitcher_mask & (war["G_all"] >= 25))
)
before = len(war)
war = war[keep].copy()
print(f"Rows before filter: {before:,}   after: {len(war):,}   dropped: {before - len(war):,}")

# --- Attach player names ---
name_map = (
    people[["playerID", "nameFirst", "nameLast"]]
    .assign(name=lambda d: d["nameFirst"] + " " + d["nameLast"])
    [["playerID", "name"]]
    .set_index("playerID")["name"]
    .to_dict()
)
war["name"] = war["playerID"].map(name_map)

# --- Attach franchise_name ---
war["franchise_name"] = war["franchID"].map(most_recent_name)

# --- Deduplicate: one row per (playerID, franchID, yearID, pos_version) ---
# Takes the max WAR in the rare case of duplicate stints surviving the join.
war = (
    war.groupby(["playerID", "name", "franchID", "franchise_name", "yearID", "pos_version"], as_index=False)
    ["WAR"].max()
)

print(f"Rows after dedup: {len(war):,}")
print(f"Unique franchises: {war['franchID'].nunique()}")
print(f"Unique players:    {war['playerID'].nunique():,}")

# --- Emit JSON ---
records = (
    war.rename(columns={
        "playerID":       "id",
        "name":           "n",
        "franchID":       "fid",
        "franchise_name": "fn",
        "yearID":         "y",
        "pos_version":    "pos",
        "WAR":            "war",
    })[["id", "n", "fid", "fn", "y", "pos", "war"]]
    .to_dict(orient="records")
)

out_path = DATA / "game-data.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(records, f, separators=(",", ":"))

size_mb = out_path.stat().st_size / 1e6
print(f"\nWrote {len(records):,} records to game-data.json  ({size_mb:.2f} MB)")

# --- Spot check ---
def check(first, last, franch):
    pid = people[(people["nameFirst"]==first) & (people["nameLast"]==last)]["playerID"].iloc[0]
    rows = war[(war["playerID"]==pid) & (war["franchID"]==franch)]
    print(f"\n{first} {last} @ {franch}:")
    print(rows[["yearID","pos_version","WAR","franchise_name"]].sort_values("yearID").to_string(index=False))

print("\n" + "="*60)
print("SPOT CHECKS")
print("="*60)
check("Bryce",  "Harper",  "PHI")
check("Gary",   "Carter",  "WSN")   # Expos era
check("Shohei", "Ohtani",  "ANA")   # two-way
