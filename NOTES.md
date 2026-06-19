# Dev Notes

Running scratchpad for useful commands, decisions, and things to remember.
Add to this as the project grows.

---

## Running the app

```bash
cd app
npm run dev        # dev server at http://localhost:5173 (hot reload)
npm run preview    # serve the last production build at http://localhost:4173
npm run build      # production build → app/dist/
```

## Data pipeline (Python, mlbwar conda env)

Run these in order to regenerate all intermediate files and game-data.json:

```bash
conda activate mlbwar
python data/build_positions.py       # positions.csv from Appearances.csv
python data/build_war_table.py       # war_positions.csv (WAR joined onto positions)
python data/build_franchise_map.py   # adds franchID + franchise_name, filters to 30 active franchises
python data/build_game_data.py       # emits data/game-data.json (also copies to app/public/)
python data/validate_game_data.py    # acceptance tests — all 11 must pass
```

Raw files live in `data/raw/` (git-ignored, not redistributable).

## Saved screens

- **DataProbe** (`app/src/DataProbe.tsx`) — franchise + year-range picker that
  lists eligible players with their best WAR. Saved from slice 2.1.
  To view: `cd app && npm run preview` → http://localhost:4173

## Deferred: hard mode design

Hard mode should offer two settings after selecting it on the setup screen:
1. **Total year range** — an outer window (e.g. 2000–2025) that constrains all rounds
2. **Round window size** — a fixed interval in years (e.g. 3), must be < total range span

Each round, a random start year is drawn within the outer window such that
[start, start + window] stays inside it. Both team and year range are randomized per round.

## Deferred: player name accuracy

Player names come from Lahman's `People.csv` (nameFirst + nameLast). Some names are wrong or
outdated — e.g. "Bobby Witt" instead of "Bobby Witt Jr.", missing suffixes (Jr., Sr., III).
To fix: audit `People.csv` for known suffixes and patch the relevant rows, or override a small
lookup table in `build_game_data.py`. Verify against Baseball-Reference player pages.

## Deferred UI ideas

- **Team logo** next to franchise name on draft screen. MLB logo assets aren't freely redistributable;
  options: ESPN CDN URLs (fragile), Sportsdb API (free, community logos), or SVG set purchased/licensed.
  Hook: `<img src={logoUrl(fid)} />` next to `<span>{franchise.fn}</span>` in DraftScreen topBar.

- **Player headshot** next to player name in LineupCard. Baseball-Reference has photos but no public API.
  Options: MLB Stats API (`https://img.mlbstatic.com/mlb-photos/...` keyed by MLBAM id), requires
  mapping Lahman playerID → MLBAM id (available in `data/raw/People.csv` column `mlbID`).
  Hook: add optional `photoUrl` to `DraftPick`; render `<img>` in `nameCell` of LineupCard if present.

## game-data.json field names

The JSON uses compact keys to keep the file small (~6 MB uncompressed, ~1.6 MB gzipped):

| Key  | Meaning          |
|------|------------------|
| `id` | playerID         |
| `n`  | full name        |
| `fid`| franchID         |
| `fn` | franchise name   |
| `y`  | season year      |
| `pos`| position version |
| `war`| bWAR             |
