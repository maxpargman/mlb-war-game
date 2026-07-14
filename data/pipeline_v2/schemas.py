"""
schemas.py — Gate 1 schema contracts for pipeline_v2.

Each raw source has a SourceSchema naming the columns downstream slices
depend on. A column present in the raw file but not listed here is fine —
schema assertions require only that the columns (and rough types) we
actually depend on are still there, not an exhaustive match. A missing or
mistyped column raises immediately at load time instead of silently
propagating (or silently dropping rows) downstream, which is exactly the
class of bug pipeline v1 shipped with (BR/Lahman ID and team-code
mismatches that dropped whole player-seasons with no error).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceSchema:
    name: str
    required_columns: tuple[str, ...]
    numeric_columns: tuple[str, ...] = field(default_factory=tuple)
    year_column: str | None = None
    player_id_column: str | None = None


APPEARANCES = SourceSchema(
    name="Appearances.csv",
    required_columns=(
        "yearID", "teamID", "playerID", "G_all",
        "G_p", "G_c", "G_1b", "G_2b", "G_3b", "G_ss",
        "G_lf", "G_cf", "G_rf", "G_of", "G_dh",
    ),
    numeric_columns=(
        "yearID", "G_all", "G_p", "G_c", "G_1b", "G_2b", "G_3b", "G_ss",
        "G_lf", "G_cf", "G_rf", "G_of", "G_dh",
    ),
    year_column="yearID",
    player_id_column="playerID",
)

PEOPLE = SourceSchema(
    name="People.csv",
    required_columns=("playerID", "nameFirst", "nameLast", "bbrefID"),
    player_id_column="playerID",
)

TEAMS = SourceSchema(
    name="Teams.csv",
    # teamIDBR seeds slice 3.2's year-aware BR<->Lahman team mapping table.
    required_columns=("yearID", "teamID", "franchID", "name", "teamIDBR"),
    numeric_columns=("yearID",),
    year_column="yearID",
)

TEAMS_FRANCHISES = SourceSchema(
    name="TeamsFranchises.csv",
    required_columns=("franchID", "franchName", "active"),
)

# Minimum counting-stat columns per CC_PLAN.md's canonical layer spec. All
# other counting-stat columns present get carried too (cheap in Parquet) —
# this list is only the floor that schema assertions enforce.
BATTING = SourceSchema(
    name="Batting.csv",
    required_columns=(
        "playerID", "yearID", "teamID", "stint",
        "G", "AB", "H", "2B", "3B", "HR", "RBI", "SB", "CS", "BB", "SO",
    ),
    numeric_columns=(
        "yearID", "stint", "G", "AB", "H", "2B", "3B", "HR", "RBI", "SB", "CS", "BB", "SO",
    ),
    year_column="yearID",
    player_id_column="playerID",
)

PITCHING = SourceSchema(
    name="Pitching.csv",
    required_columns=(
        "playerID", "yearID", "teamID", "stint",
        "W", "L", "G", "GS", "SV", "IPouts", "H", "ER", "HR", "BB", "SO",
    ),
    numeric_columns=(
        "yearID", "stint", "W", "L", "G", "GS", "SV", "IPouts", "H", "ER", "HR", "BB", "SO",
    ),
    year_column="yearID",
    player_id_column="playerID",
)

WAR_DAILY_BAT = SourceSchema(
    name="war_daily_bat.txt",
    required_columns=("player_ID", "year_ID", "team_ID", "stint_ID", "WAR", "name_common"),
    numeric_columns=("year_ID", "stint_ID", "WAR"),
    year_column="year_ID",
    player_id_column="player_ID",
)

WAR_DAILY_PITCH = SourceSchema(
    name="war_daily_pitch.txt",
    required_columns=("player_ID", "year_ID", "team_ID", "stint_ID", "WAR", "name_common"),
    numeric_columns=("year_ID", "stint_ID", "WAR"),
    year_column="year_ID",
    player_id_column="player_ID",
)

CHADWICK_REGISTER = SourceSchema(
    name="chadwickbureau register",
    required_columns=("key_bbref", "name_first", "name_last", "name_suffix"),
    player_id_column="key_bbref",
)

ALL_SCHEMAS = (
    APPEARANCES, PEOPLE, TEAMS, TEAMS_FRANCHISES,
    BATTING, PITCHING, WAR_DAILY_BAT, WAR_DAILY_PITCH, CHADWICK_REGISTER,
)
