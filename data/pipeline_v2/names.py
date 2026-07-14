"""
names.py — Slice 3.4: three-tier suffix system + display-name assembly.

Tier 1: Chadwick register (key_bbref -> name_suffix), validated against a
closed allowlist of real suffix tokens {Jr., Sr., II, III, IV}. Anything
else -- e.g. "David Armstrong" and "Eli", real garbage values sitting in
the register -- is rejected by the allowlist itself, not a hardcoded
exclusion list of specific bad strings (pipeline v1's approach).

Tier 2: overrides.csv -- versioned, hand-curated fixes for cases where the
register has no suffix at all for a specific, already-confirmed
father/son pair sharing an identical name (Alomar, Guerrero, Tatis,
DeShields, Pena -- confirmed with Max in an earlier session; see
overrides.csv for detail). This is NOT an open-ended audit: a blind
"same first+last name, no suffix" scan over the current player universe
turns up 682 collision groups, and the overwhelming majority are just
unrelated namesakes who correctly have no suffix (verified while building
this slice). Overrides only ever get added deliberately, one confirmed
case at a time -- never by pattern-matching alone.

Tier 3: no suffix.

Staleness check: if the register now has a valid suffix for a bbrefID
that's also in overrides.csv, the override is redundant -- warn so it can
be removed. As of this run, none of the 6 current overrides are stale.

Run with the mlbwar env active, from the repo root:
    python data/pipeline_v2/names.py
"""

import sys
from pathlib import Path
import pandas as pd

from loaders import load_chadwick_register

VALID_SUFFIXES = {"Jr.", "Sr.", "II", "III", "IV"}
OVERRIDES_PATH = Path(__file__).parent / "overrides.csv"


def load_register_suffixes(register: pd.DataFrame) -> tuple[dict[str, str], pd.DataFrame]:
    """Returns (bbrefID -> suffix for allowlist-valid entries, rejected rows)."""
    reg_mlb = register[register["key_bbref"].notna() & (register["key_bbref"].astype(str).str.strip() != "")].copy()
    reg_mlb["key_bbref"] = reg_mlb["key_bbref"].astype(str).str.strip()

    with_suffix = reg_mlb.dropna(subset=["name_suffix"]).copy()
    with_suffix["name_suffix"] = with_suffix["name_suffix"].astype(str).str.strip()
    with_suffix = with_suffix[with_suffix["name_suffix"] != ""]

    valid = with_suffix[with_suffix["name_suffix"].isin(VALID_SUFFIXES)]
    rejected = with_suffix[~with_suffix["name_suffix"].isin(VALID_SUFFIXES)]

    dupes = valid[valid.duplicated(subset=["key_bbref"], keep=False)]
    if len(dupes):
        raise ValueError(
            f"Chadwick register has duplicate key_bbref with a valid suffix - key is not unique: "
            f"{sorted(dupes['key_bbref'].unique().tolist())}"
        )

    return valid.set_index("key_bbref")["name_suffix"].to_dict(), rejected


def load_overrides() -> pd.DataFrame:
    overrides = pd.read_csv(OVERRIDES_PATH)
    invalid = overrides[~overrides["suffix"].isin(VALID_SUFFIXES)]
    if len(invalid):
        raise ValueError(f"overrides.csv has suffix value(s) outside the allowlist: {invalid[['bbrefID', 'suffix']].to_dict('records')}")
    dupes = overrides[overrides.duplicated(subset=["bbrefID"], keep=False)]
    if len(dupes):
        raise ValueError(f"overrides.csv has duplicate bbrefID entries: {sorted(dupes['bbrefID'].unique().tolist())}")
    return overrides


def resolve_suffixes(register_suffixes: dict[str, str], overrides: pd.DataFrame) -> tuple[dict[str, str], list[str]]:
    """Combines tiers 1+2. Returns (bbrefID -> suffix, stale_override_bbrefIDs)."""
    resolved = dict(register_suffixes)
    stale = []
    for row in overrides.itertuples(index=False):
        if register_suffixes.get(row.bbrefID) == row.suffix:
            stale.append(row.bbrefID)
        resolved[row.bbrefID] = row.suffix
    return resolved, stale


def assemble_display_name(first: str, last: str, suffix: str | None) -> str:
    base = f"{first} {last}"
    return f"{base} {suffix}" if suffix else base


def main() -> None:
    print("=" * 78)
    print("SLICE 3.4 - NAMES + SUFFIXES")
    print("=" * 78)

    register = load_chadwick_register()
    register_suffixes, rejected = load_register_suffixes(register)
    print(f"\nValid register suffixes: {len(register_suffixes):,}")
    print(f"Rejected (not in allowlist {sorted(VALID_SUFFIXES)}): {len(rejected)}")
    for row in rejected.itertuples(index=False):
        print(f"    key_bbref={row.key_bbref}  name_suffix={row.name_suffix!r}")

    overrides = load_overrides()
    print(f"\nOverrides loaded: {len(overrides)}")

    resolved, stale = resolve_suffixes(register_suffixes, overrides)
    print(f"Total resolved suffixes (register + overrides): {len(resolved):,}")
    if stale:
        print(f"\n[WARN] {len(stale)} override(s) are now stale - the register agrees, override is removable:")
        for bbrefID in stale:
            print(f"    {bbrefID}")
    else:
        print("No stale overrides.")

    print("\n--- Spot-check (known father/son pairs) ---")
    checks = [
        ("wittbo01", None), ("wittbo02", "Jr."),
        ("guerrvl01", None), ("guerrvl02", "Jr."),
        ("tatisfe01", None), ("tatisfe02", "Jr."),
        ("alomasa01", "Sr."), ("alomasa02", "Jr."),
        ("deshide01", None), ("deshide02", "Jr."),
        ("penato03", "Jr."),
        ("griffke01", "Sr."), ("griffke02", "Jr."),
        ("gwynnto01", "Sr."), ("gwynnto02", "Jr."),
        ("ripkeca99", "Sr."), ("ripkeca01", "Jr."),
    ]
    all_ok = True
    for bbrefID, expected in checks:
        got = resolved.get(bbrefID)
        ok = got == expected
        all_ok = all_ok and ok
        print(f"    {'OK  ' if ok else 'FAIL'}  {bbrefID:12s} expected={expected!r:6s} got={got!r}")

    print("\n--- Display-name assembly examples ---")
    examples = [
        ("Bobby", "Witt", resolved.get("wittbo02")),
        ("Vladimir", "Guerrero", resolved.get("guerrvl02")),
        ("Sandy", "Alomar", resolved.get("alomasa01")),
        ("Cal", "Ripken", resolved.get("ripkeca01")),
        ("Bryce", "Harper", resolved.get("harpebr03")),
    ]
    for first, last, suffix in examples:
        print(f"    {assemble_display_name(first, last, suffix)!r}")

    if not all_ok:
        print("\n[FAIL] Spot-check failed.")
        sys.exit(1)

    print("\nAll spot-checks passed.")


if __name__ == "__main__":
    main()
