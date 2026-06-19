"""
validate_game_data.py

Acceptance test for game-data.json. Queries the file exactly as the app
will at runtime: for a given franchise + year range, find each player's
best qualifying WAR at each position-version.

Run with the mlbwar env active:
    python data\\validate_game_data.py

All assertions must pass for this slice to be complete.
"""

import json, sys
from pathlib import Path
from collections import defaultdict

data = json.loads((Path(__file__).parent / "game-data.json").read_text(encoding="utf-8"))

# ── runtime query helper ──────────────────────────────────────────────────────

def best_war(franch, name_substr, pos, year_lo=None, year_hi=None):
    """
    Return the best qualifying WAR for a player at a position with a franchise,
    optionally within [year_lo, year_hi].  Mirrors what the app will compute.
    """
    seasons = [
        r for r in data
        if r["fid"] == franch
        and r["pos"] == pos
        and name_substr.lower() in r["n"].lower()
        and (year_lo is None or r["y"] >= year_lo)
        and (year_hi is None or r["y"] <= year_hi)
    ]
    if not seasons:
        return None, None
    best = max(seasons, key=lambda r: r["war"])
    return best["war"], best["y"]


# ── assertions ────────────────────────────────────────────────────────────────

PASS = []
FAIL = []

def check(label, actual, expected, tol=0.05):
    ok = actual is not None and abs(actual - expected) <= tol
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {label}: got {actual} (expected ~{expected})")
    (PASS if ok else FAIL).append(label)

print("=" * 65)
print("ACCEPTANCE TESTS — game-data.json")
print("=" * 65)

# ── 1. Design-doc examples (Harper) ──────────────────────────────────────────
print("\n1. Design-doc examples (from game-design.md §5)")

war, yr = best_war("PHI", "Harper", "OF")
check("Harper-OF best (PHI, all years)", war, 5.85)
assert yr == 2021, f"Expected 2021 but got {yr}"

war, yr = best_war("PHI", "Harper", "1B")
check("Harper-1B best (PHI, all years)", war, 4.60)
assert yr == 2024, f"Expected 2024 but got {yr}"

# Same player, restricted range that excludes 2024
war, _ = best_war("PHI", "Harper", "1B", year_lo=2019, year_hi=2023)
check("Harper-1B best (PHI, 2019-2023)", war, 3.64)

# ── 2. Cross-era / historical examples ───────────────────────────────────────
print("\n2. Cross-era / historical examples")

# Gary Carter best catcher season as a National (Expos era)
war, yr = best_war("WSN", "Carter", "C")
check("Gary Carter-C best (WSN franchise)", war, 8.61)
assert yr == 1982, f"Expected 1982 but got {yr}"

# Mike Schmidt, 3B Phillies
war, yr = best_war("PHI", "Schmidt", "3B")
check("Mike Schmidt-3B best (PHI)", war, 9.7, tol=0.5)

# Babe Ruth, OF Yankees
war, yr = best_war("NYY", "Ruth", "OF")
check("Babe Ruth-OF best (NYY)", war, 14.0, tol=2.0)

# ── 3. Two-way player (Ohtani) ───────────────────────────────────────────────
print("\n3. Two-way player — Ohtani")

war_p,  _ = best_war("ANA", "Ohtani", "P")
war_of, _ = best_war("ANA", "Ohtani", "OF")
check("Ohtani-P best (ANA)", war_p, 4.07, tol=0.5)
check("Ohtani-OF best (ANA)", war_of, 4.89, tol=0.5)
print(f"    (Both versions present: P={war_p}, OF={war_of})")

# ── 4. Franchise continuity ───────────────────────────────────────────────────
print("\n4. Franchise continuity (Expos / Nationals)")

# Tim Raines, OF — Expos era, should surface under WSN
war, yr = best_war("WSN", "Raines", "OF")
check("Tim Raines-OF best (WSN franchise, Expos era)", war, 7.6, tol=0.5)
print(f"    (Best season: {yr})")

# ── 5. File integrity ─────────────────────────────────────────────────────────
print("\n5. File integrity")

franch_ids = {r["fid"] for r in data}
print(f"    Unique franchises: {len(franch_ids)}  (expected 30)")
assert len(franch_ids) == 30, f"Got {len(franch_ids)}"
PASS.append("30 active franchises present")

positions_found = {r["pos"] for r in data}
expected_pos = {"C", "1B", "2B", "3B", "SS", "OF", "P"}
missing = expected_pos - positions_found
print(f"    Positions in file: {sorted(positions_found)}")
assert not missing, f"Missing positions: {missing}"
PASS.append("All 7 position codes present")

# ── Summary ───────────────────────────────────────────────────────────────────
print()
print("=" * 65)
print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
if FAIL:
    print("FAILED:", FAIL)
    sys.exit(1)
else:
    print("All checks passed.")
