"""
id_crosswalk.py — shared bbrefID -> Lahman playerID crosswalk.

Discovered while debugging a stat-join gap in slice 3.3: People.csv has 12
bbrefID values each claimed by TWO different Lahman playerIDs (e.g. both
`mcclubo01` [Bob McClure, 1975-1993] and `mcclubo02` [a 1920s player of the
same name] have bbrefID="mcclubo01" — the 1920s row's bbrefID field looks
like a Lahman data-entry error, not a real BR identity). Building a naive
`set_index("bbrefID").to_dict()` over that silently keeps whichever row
happens to come last, with zero warning — the exact "silent ID collision"
failure mode this whole pipeline rebuild exists to eliminate, just found
in a new place (Lahman's own crosswalk column, not a BR/Lahman disagreement
this time).

In every one of the 12 observed pairs, exactly one row has a real `debut`
date and the other is undocumented (debut/finalGame both null) — a clean,
consistent signal. Resolution: when a bbrefID is duplicated, keep the row
with a real debut date; drop the undocumented duplicate from the
crosswalk. This was previously two separate, independently-buggy inline
implementations (team_mapping.py and war_ingestion.py each had their own);
consolidated here so there's exactly one place this logic lives.
"""

import pandas as pd


def find_bbref_duplicates(people: pd.DataFrame) -> pd.DataFrame:
    """All rows sharing a bbrefID with at least one other row, for reporting."""
    with_bbref = people.dropna(subset=["bbrefID"])
    dupes = with_bbref[with_bbref.duplicated(subset=["bbrefID"], keep=False)]
    return dupes.sort_values("bbrefID")


def build_bbref_crosswalk(people: pd.DataFrame) -> dict[str, str]:
    """bbrefID -> Lahman playerID, deduplicated by preferring the row with a
    real debut date over an undocumented duplicate."""
    with_bbref = people.dropna(subset=["bbrefID"]).copy()
    with_bbref["_has_debut"] = with_bbref["debut"].notna()
    with_bbref = with_bbref.sort_values("_has_debut", ascending=False)
    deduped = with_bbref.drop_duplicates(subset=["bbrefID"], keep="first")
    return deduped.set_index("bbrefID")["playerID"].to_dict()
