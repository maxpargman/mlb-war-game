"""
build_franchise_map.py

Adds franchID and franchise_name to war_positions.csv, then filters to
only the 30 currently active MLB franchises. A franchise's full history
maps to its current identity (e.g. Expos → Nationals, Florida → Miami
Marlins). The franchise_name used is the most recent team name for that
franchise from Teams.csv, so CLE shows "Cleveland Guardians" not "Indians".

Overwrites war_positions.csv with the two new columns added and inactive
franchise rows removed.

Run with the mlbwar env active:
    python data\\build_franchise_map.py
"""

from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / "raw"
DATA = Path(__file__).parent

# --- Load ---
teams = pd.read_csv(RAW / "Teams.csv", low_memory=False)
tf = pd.read_csv(RAW / "TeamsFranchises.csv")
war = pd.read_csv(DATA / "war_positions.csv")

# --- Active franchises ---
active_franchises = tf[tf["active"] == "Y"][["franchID"]].copy()

# Most recent name for each franchise (for display)
most_recent_name = (
    teams[teams["franchID"].isin(active_franchises["franchID"])]
    .sort_values("yearID")
    .groupby("franchID")["name"]
    .last()
    .reset_index()
    .rename(columns={"name": "franchise_name"})
)

# teamID → franchID mapping (every historical team code)
team_to_franch = teams[["teamID", "franchID"]].drop_duplicates()

# --- Join franchise info onto war_positions ---
# Drop columns if they already exist so the script is idempotent.
war = war.drop(columns=[c for c in ["franchID", "franchise_name"] if c in war.columns])
war = war.merge(team_to_franch, on="teamID", how="left")

# Debug: flag teamIDs that didn't map to any franchise
unmapped = war[war["franchID"].isna()]["teamID"].value_counts()
if not unmapped.empty:
    print("WARNING: unmapped teamIDs (no franchID found):", unmapped.to_dict())

war = war.merge(most_recent_name, on="franchID", how="left")

# Filter to active franchises only
before = len(war)
war = war[war["franchID"].isin(active_franchises["franchID"])].copy()
after = len(war)
print(f"Rows before filter: {before:,}  after: {after:,}  dropped: {before - after:,}")

war.to_csv(DATA / "war_positions.csv", index=False)
print(f"Wrote {after:,} rows to war_positions.csv")
print(f"Active franchises represented: {war['franchID'].nunique()}")

# --- Spot checks ---
people = pd.read_csv(RAW / "People.csv")

def get_pid(first, last):
    return people[(people["nameFirst"] == first) & (people["nameLast"] == last)]["playerID"].iloc[0]

def show(label, mask):
    rows = war[mask].sort_values(["yearID", "pos_version"])
    print(f"\n{label}:")
    print(rows[["playerID", "yearID", "teamID", "franchID", "franchise_name", "pos_version", "WAR"]].to_string(index=False))

print("\n" + "=" * 70)
print("SPOT CHECKS")
print("=" * 70)

# Expos → Nationals: Gary Carter (HOF catcher, career Expo)
carter_pid = get_pid("Gary", "Carter")
show("Gary Carter (Expos, should map to WSN/Nationals)", war["playerID"] == carter_pid)

# Harper with Phillies (franchise already PHI)
harper_pid = get_pid("Bryce", "Harper")
show("Bryce Harper @ PHI", (war["playerID"] == harper_pid) & (war["teamID"] == "PHI"))

# Florida/Miami Marlins continuity
show("FLA franchise in war_positions (sample)", (war["franchID"] == "FLA") & (war["yearID"] >= 2010) & (war["WAR"] > 3))

# Cleveland: should show Guardians as franchise_name
show("Cleveland franchise name check (recent)", (war["franchID"] == "CLE") & (war["yearID"] >= 2020))
