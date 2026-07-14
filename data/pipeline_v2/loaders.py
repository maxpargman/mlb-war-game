"""
loaders.py — raw-file loaders for pipeline_v2.

Each loader reads its source and immediately asserts the columns it
requires are present with sane types (Gate 1 schema assertions), raising
SchemaError on mismatch rather than letting a format change propagate
silently downstream.
"""

from pathlib import Path
import pandas as pd

from schemas import (
    SourceSchema, APPEARANCES, PEOPLE, TEAMS, TEAMS_FRANCHISES,
    BATTING, PITCHING, WAR_DAILY_BAT, WAR_DAILY_PITCH, CHADWICK_REGISTER,
)

RAW = Path(__file__).parent.parent / "raw"


class SchemaError(Exception):
    """Raised when a raw source no longer matches its expected schema."""


def _assert_schema(df: pd.DataFrame, schema: SourceSchema) -> None:
    missing = [c for c in schema.required_columns if c not in df.columns]
    if missing:
        raise SchemaError(
            f"{schema.name}: missing required column(s) {missing}. "
            f"Actual columns: {list(df.columns)}"
        )
    non_numeric = [c for c in schema.numeric_columns if not pd.api.types.is_numeric_dtype(df[c])]
    if non_numeric:
        raise SchemaError(
            f"{schema.name}: expected numeric column(s) {non_numeric} are not numeric "
            f"(dtypes: {[str(df[c].dtype) for c in non_numeric]})"
        )


def load_appearances() -> pd.DataFrame:
    df = pd.read_csv(RAW / "Appearances.csv", low_memory=False)
    _assert_schema(df, APPEARANCES)
    return df


def load_people() -> pd.DataFrame:
    df = pd.read_csv(RAW / "People.csv", low_memory=False)
    _assert_schema(df, PEOPLE)
    return df


def load_teams() -> pd.DataFrame:
    df = pd.read_csv(RAW / "Teams.csv", low_memory=False)
    _assert_schema(df, TEAMS)
    return df


def load_teams_franchises() -> pd.DataFrame:
    df = pd.read_csv(RAW / "TeamsFranchises.csv", low_memory=False)
    _assert_schema(df, TEAMS_FRANCHISES)
    return df


def load_batting() -> pd.DataFrame:
    df = pd.read_csv(RAW / "Batting.csv", low_memory=False)
    _assert_schema(df, BATTING)
    return df


def load_pitching() -> pd.DataFrame:
    df = pd.read_csv(RAW / "Pitching.csv", low_memory=False)
    _assert_schema(df, PITCHING)
    return df


def load_war_bat() -> pd.DataFrame:
    df = pd.read_csv(RAW / "war_daily_bat.txt", na_values="NULL", low_memory=False)
    _assert_schema(df, WAR_DAILY_BAT)
    return df


def load_war_pitch() -> pd.DataFrame:
    df = pd.read_csv(RAW / "war_daily_pitch.txt", na_values="NULL", low_memory=False)
    _assert_schema(df, WAR_DAILY_PITCH)
    return df


def load_chadwick_register() -> pd.DataFrame:
    reg_dir = RAW / "chadwichbureau" / "register-master" / "data"
    files = sorted(reg_dir.glob("people-*.csv"))
    if not files:
        raise SchemaError(f"chadwickbureau register: no people-*.csv files found in {reg_dir}")
    df = pd.concat([pd.read_csv(f, low_memory=False) for f in files], ignore_index=True)
    _assert_schema(df, CHADWICK_REGISTER)
    return df


# Ordered so the intake report reads join-key sources first, then stats.
ALL_LOADERS = {
    "Appearances.csv": load_appearances,
    "People.csv": load_people,
    "Teams.csv": load_teams,
    "TeamsFranchises.csv": load_teams_franchises,
    "Batting.csv": load_batting,
    "Pitching.csv": load_pitching,
    "war_daily_bat.txt": load_war_bat,
    "war_daily_pitch.txt": load_war_pitch,
    "chadwickbureau register": load_chadwick_register,
}
