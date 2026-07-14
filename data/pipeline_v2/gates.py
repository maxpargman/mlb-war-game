"""
gates.py — pipeline_v2 completeness gates.

Gate 1 (intake) lives here for slice 3.1. Gates 2-5 (conservation, canonical
coverage, view reconciliation, reconciliation report) get added in later
slices as the pipeline actually has stages to check between.
"""

from dataclasses import dataclass
import pandas as pd

from schemas import SourceSchema


@dataclass
class Gate1Result:
    name: str
    rows: int
    columns: int
    year_min: int | None
    year_max: int | None
    distinct_players: int | None


def gate1_intake(df: pd.DataFrame, schema: SourceSchema) -> Gate1Result:
    year_min = year_max = None
    if schema.year_column and schema.year_column in df.columns:
        year_min = int(df[schema.year_column].min())
        year_max = int(df[schema.year_column].max())

    distinct_players = None
    if schema.player_id_column and schema.player_id_column in df.columns:
        distinct_players = int(df[schema.player_id_column].nunique())

    return Gate1Result(
        name=schema.name,
        rows=len(df),
        columns=len(df.columns),
        year_min=year_min,
        year_max=year_max,
        distinct_players=distinct_players,
    )
