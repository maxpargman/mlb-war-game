"""
inspect_data.py

Loads the six raw data files and prints a summary of each, then runs a
Bryce Harper sanity check that ties directly to our game design example
(his best OF season and best 1B season with the Phillies).

Run AFTER placing the raw files in data/raw/, with the mlbwar env active:
    python data\\inspect_data.py

Nothing here changes any file -- it only reads and prints.
"""

from pathlib import Path
import pandas as pd

RAW = Path(__file__).parent / "raw"

pd.set_option("display.max_columns", 12)
pd.set_option("display.width", 160)


def summarize(name, df):
    print("=" * 72)
    print(name)
    print("-" * 72)
    print(f"rows: {len(df):,}   columns: {df.shape[1]}")
    print(f"columns: {list(df.columns)}")
    print("first 3 rows:")
    print(df.head(3))
    print()


# --- Load the files ---
# The Baseball-Reference WAR files are comma-separated text that use the
# literal string 'NULL' for missing values, so we tell pandas about that.
war_bat = pd.read_csv(RAW / "war_daily_bat.txt", na_values="NULL", low_memory=False)
war_pitch = pd.read_csv(RAW / "war_daily_pitch.txt", na_values="NULL", low_memory=False)
appearances = pd.read_csv(RAW / "Appearances.csv")
people = pd.read_csv(RAW / "People.csv")

summarize("war_daily_bat.txt   (Baseball-Reference batting WAR)", war_bat)
summarize("war_daily_pitch.txt (Baseball-Reference pitching WAR)", war_pitch)
summarize("Appearances.csv     (Lahman: games played by position)", appearances)
summarize("People.csv          (Lahman: player names + IDs)", people)


# --- Bryce Harper sanity check ---
# Design example: with the Phillies, Harper's best OF season (2021, ~5.9 WAR)
# and best 1B season (2024, ~4.6 WAR) should both be visible in the data.
print("=" * 72)
print("BRYCE HARPER SANITY CHECK")
print("-" * 72)

# 1) Batting WAR with the Phillies, season by season (PHI = Phillies)
try:
    harper_war = war_bat[war_bat["name_common"] == "Bryce Harper"]
    phi_war = harper_war[harper_war["team_ID"] == "PHI"]
    print("Harper batting WAR with PHI:")
    print(
        phi_war[["year_ID", "team_ID", "stint_ID", "WAR"]]
        .sort_values("year_ID")
        .to_string(index=False)
    )
except Exception as e:
    print(f"  (could not run WAR check: {e})")

print()

# 2) Games by position, to confirm the OF-vs-1B split that creates the
#    two draftable position-versions.
try:
    bryce_id = people[
        (people["nameFirst"] == "Bryce") & (people["nameLast"] == "Harper")
    ]["playerID"].iloc[0]
    print(f"Harper playerID: {bryce_id}")
    cols = ["yearID", "teamID", "G_all", "G_c", "G_1b", "G_2b", "G_3b", "G_ss", "G_of", "G_p"]
    h_app = appearances[appearances["playerID"] == bryce_id]
    print("Harper games by position with PHI:")
    print(
        h_app[h_app["teamID"] == "PHI"][cols]
        .sort_values("yearID")
        .to_string(index=False)
    )
except Exception as e:
    print(f"  (could not run positions check: {e})")

print()
print("Done. If the two Harper tables above look right, the raw data is good.")
