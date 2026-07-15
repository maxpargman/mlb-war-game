# Dev Notes

Running scratchpad for useful commands, decisions, and things to remember.
Add to this as the project grows.

---

## Deployment

- **Live URL:** https://mlb-war-draft.vercel.app/
- **Vercel dashboard:** https://vercel.com/mlb-games/mlb-war-draft
- **GitHub repo:** https://github.com/maxpargman/mlb-war-game
- Pushes to `master` auto-deploy to production
- Vercel root directory is set to `app/`

## Running the app

```bash
cd app
npm run dev        # dev server at http://localhost:5173 (hot reload)
npm run preview    # serve the last production build at http://localhost:4173
npm run build      # production build → app/dist/
```

## Data pipeline (Python, mlbwar conda env)

The pipeline was rebuilt from scratch in CC_PLAN.md Phase 3 (canonical layer
+ gates). The old `data/build_*.py` scripts (positions → WAR table →
franchise map → game data → validate) were retired and removed in slice 3.9
once the new pipeline's output was verified and swapped in as the live
`game-data.json`; their history is preserved in git (see commits from
Phase 3, and the removal commit itself) if ever needed for reference.

Annual-update ritual: refresh the raw Lahman/Baseball-Reference/Chadwick
files under `data/raw/`, then run the whole thing with one command:

```bash
conda activate mlbwar
python data/pipeline_v2/run_pipeline.py
```

This chains all 6 stages (intake → team mapping → WAR/stat ingestion →
names/suffixes → canonical assembly + gates → view generation), stopping at
the first failure. Produces fresh **local** files only:
- `data/canonical/canonical.parquet` — the canonical dataset
- `data/canonical/reconciliation_report.txt` — Gate 5 human-readable report
- `data/canonical/franchise_audit.xlsx` — per-franchise manual-review workbook
- `data/game-data.json` + `app/public/game-data.json` — the app's data file (auto-copied)

None of this is committed automatically — review the reconciliation report
and audit workbook, then decide whether to ship (commit `game-data.json` on
a branch, verify on the preview URL, merge — see CC_PLAN.md slice 3.9).

Each stage can also be run individually from `data/pipeline_v2/` if you only
need to re-check one piece (`python data/pipeline_v2/intake.py`, etc.) — see
each script's own docstring.

**Known local-environment quirk:** if `data/canonical/franchise_audit.xlsx`
is open in Excel, the pipeline's write to it fails with a `PermissionError`
(look for a `~$franchise_audit.xlsx` lock file to confirm). Close the file
and re-run.

Raw files live in `data/raw/` (git-ignored, not redistributable).

## Saved screens

- **DataProbe** (`app/src/DataProbe.tsx`) — franchise + year-range picker that
  lists eligible players with their best WAR. Saved from slice 2.1.
  To view: `cd app && npm run preview` → http://localhost:4173

## Deferred: share score (Wordle-style)

After completing the daily challenge, let users share their score via text/social.
Format similar to Wordle — emoji grid or lineup summary + score + link to play.
Example:
  ⚾ MLB WAR Draft — Daily Easy (2026-06-19)
  🏆 47.3 WAR
  https://mlb-war-draft.vercel.app/
Use the Web Share API (`navigator.share`) where available (mobile), fall back to
clipboard copy on desktop.

## Deferred: same player on different teams

Currently a player can only be drafted once per game regardless of which franchise they played for.
Revisit whether a player should be draftable again if they appear for a different franchise — e.g.
Mike Trout for the Angels AND the Dodgers (if he ever played there). This is related to the
"allowing duplicate players" open item in game-design.md §10.

## Deferred: revisit daily difficulty settings

Current setup:
- Easy: all time, all franchises
- Medium: post-1970, random 10-year windows
- Hard: post-1970, random 5-year windows

Discuss whether these feel right in practice — year ranges, era cutoffs, window sizes.
Could also consider making the era cutoff (1970) configurable or tied to the franchise.

## Deferred: hard mode design (2-player)

Hard mode should offer two settings after selecting it on the setup screen:
1. **Total year range** — an outer window (e.g. 2000–2025) that constrains all rounds
2. **Round window size** — a fixed interval in years (e.g. 3), must be < total range span

Each round, a random start year is drawn within the outer window such that
[start, start + window] stays inside it. Both team and year range are randomized per round.

## Fixed: players silently missing from the dataset (historical, pipeline v1)

*This section describes bugs in the old, now-removed `build_*.py` pipeline.
Pipeline v2 (see "Data pipeline" above) has its own, more robust handling of
these exact issues — see `data/pipeline_v2/id_crosswalk.py` and
`team_mapping.py`'s docstrings. Kept here for historical context.*

`build_war_table.py` joined the Baseball-Reference WAR files onto Lahman's `Appearances.csv`/
`People.csv` assuming the two files used identical player IDs. They don't, always:
- BR keeps periods for initials-named players (`burnea.01`) where Lahman doesn't (`burneaj01`).
- Apostrophes in names are encoded differently between the two sources.
- For a chunk of same-surname pairs, BR and Lahman assigned the `01`/`02` suffix in *opposite*
  order (Lahman's `allento01` is Todd Allen, but Todd Allen's own bbrefID is `allento02`) — a
  naive string-equality join silently swapped these players' stats onto the wrong person.

Fixed by resolving every WAR-file ID through Lahman's `bbrefID` column (the authoritative
crosswalk) before merging, with a fallback to direct equality only for IDs absent from
`bbrefID` (mostly pre-1900 players). Recovered ~340 players including Roy Halladay-tier names
(A.J. Burnett, R.A. Dickey, J.D. Drew).

Separately, `"ATH"` was double-booked in the BR_TO_LAHMAN team crosswalk: it meant the 1871-75
Philadelphia Athletics *and*, after 2025, got reused by BR for the current Athletics (post
"Oakland" rebrand). The crosswalk blindly remapped every `ATH` row to `PH1`, wiping out the
entire current A's roster (58 players in 2025 alone, incl. Nick Kurtz). Fixed by only applying
the historical remap for years before 2025.

**Known residual gap:** ~130 players (2026 rookies/prospects) have zero Lahman record at all —
Lahman's `People.csv` snapshot hasn't caught up to the current season. No local fix; resolves
itself whenever Lahman cuts a new release (pipeline v2 keeps these players anyway, tagged
`lahman_lag` and named from the WAR file directly — see `war_ingestion.py`). Re-run
`python data/pipeline_v2/run_pipeline.py` after refreshing the raw Lahman files to pick up
newly-added players.

## Deferred UI tweaks

- **Pick panel height** — the scrollable player list (`pick-list`) is currently `max-height: 40vh`.
  User wants it shorter. Tune `max-height` in `layout.css` once overall layout is finalized.

## Deferred: instructions / how to play page

Add a page or modal explaining the game rules. Should cover:
- What WAR is and why it matters
- How the draft works (snake order, 11 rounds, one pick per position)
- What each mode does (2-player, Daily Easy/Medium/Hard)
- How scoring works (total WAR of your lineup wins)
- Accessible from the setup screen (e.g. a "How to Play" link)

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
