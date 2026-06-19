"""
build_positions.py

Computes each player's primary position per (playerID, yearID, teamID) from
Appearances.csv. Primary = the position with the most games played that season.
LF/CF/RF are collapsed into OF (using the G_of column, which is already their
sum). Pitchers are flagged as P.

Writes data/positions.csv for use in the next pipeline step.

Run with the mlbwar env active:
    python data\\build_positions.py
"""

from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / "raw"
OUT = Path(__file__).parent / "positions.csv"

# Position columns in priority order (used only to break ties, which are rare).
# G_of already equals G_lf + G_cf + G_rf in Lahman.
POS_COLS = ["G_p", "G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_of"]
POS_LABELS = ["P", "C", "1B", "2B", "3B", "SS", "OF"]

app = pd.read_csv(RAW / "Appearances.csv")

# Fill NaN game counts with 0
for col in POS_COLS:
    app[col] = app[col].fillna(0)

# idxmax across position columns gives the column name with the most games.
# Where all counts are 0 (e.g. DH-only or PR-only seasons) idxmax returns
# the first column by default; we'll label those None and filter them later.
pos_matrix = app[POS_COLS].copy()
pos_matrix.columns = POS_LABELS

app["primary_pos"] = pos_matrix.idxmax(axis=1)

# Mark rows where total qualifying games are 0 as unknown
app.loc[pos_matrix.max(axis=1) == 0, "primary_pos"] = None

# Keep only the columns downstream steps need
positions = app[["playerID", "yearID", "teamID", "G_all", "primary_pos"]].copy()
positions = positions.dropna(subset=["primary_pos"])

positions.to_csv(OUT, index=False)
print(f"Wrote {len(positions):,} rows to {OUT}")

# --- Spot-check ---
people = pd.read_csv(RAW / "People.csv")

def spot_check(first, last, team=None):
    pid = people[
        (people["nameFirst"] == first) & (people["nameLast"] == last)
    ]["playerID"].iloc[0]
    rows = positions[positions["playerID"] == pid].copy()
    if team:
        rows = rows[rows["teamID"] == team]
    rows = rows.sort_values("yearID")
    print(f"\n{first} {last} ({pid}){' @ ' + team if team else ''}:")
    print(rows[["yearID", "teamID", "G_all", "primary_pos"]].to_string(index=False))

print("\n" + "=" * 60)
print("SPOT CHECKS")
print("=" * 60)

spot_check("Bryce", "Harper", "PHI")        # OF then 1B
spot_check("Shohei", "Ohtani")              # two-way player (expect P or OF/DH depending on year)
spot_check("Mike", "Trout", "ANA")          # OF
spot_check("Mike", "Piazza")                # C
spot_check("Cal", "Ripken")                 # SS / 3B late career
