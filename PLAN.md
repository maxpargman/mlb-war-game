# Build Plan — MLB WAR Draft

This is the working checklist for the project. It is the source of truth for what gets
built and in what order. Companion docs: `game-design.md` (the rules) and
`LICENSING.md` (the data-rights decision).

---

## Working protocol (read this first)

This project is built one slice at a time, with the human (Max) supervising and
checking off each slice before the next begins. The rules for whoever is doing the
work (including Claude Code):

1. Do **only the next unchecked item**. Do not start the slice after it.
2. When the slice is done, **stop** and report: what changed, which files, and the
   exact steps for Max to verify it himself.
3. **Wait for Max's sign-off.** Do not check the box or move on without it.
4. On sign-off: check the box, commit with a clear message, then stop again.
5. On rejection: fix within the same slice, then return to step 2.
6. If something is ambiguous or a decision is needed, ask — don't guess.

Every slice ends in a Git commit, so any checkpoint can be rolled back.

---

## Phase 0 — Environment  ✅ complete

- [x] Node (LTS) + npm + Git installed and verified
- [x] Vite + React + TypeScript app scaffolded in `app/`
- [x] Runs on desktop and mobile viewport; first commit made
- [x] `data/raw/` git-ignored; `mlbwar` conda env created

---

## Phase 1 — Data pipeline (`data/`)

Goal: turn the two free sources into one static `game-data.json` the app can load.
Keep data at the **season grain** (one record per player/team/year/position) so the
time-range settings stay flexible at runtime — do **not** pre-collapse to "best WAR."

- [x] **1.1 Acquire + inspect raw data.** Six raw files in `data/raw/`; `inspect_data.py`
      runs and prints file summaries + the Bryce Harper sanity check.
      *Done when:* WAR-by-season-and-team is visible, and Harper's OF years vs 1B years
      are distinguishable in the position data.
- [x] **1.2 Primary position per season.** From `Appearances.csv`, compute each player's
      primary position per season (most games), collapsing LF/CF/RF into a single `OF`;
      pitchers flagged via `P`.
      *Done when:* a spot-check table shows correct primary positions for several known
      players (incl. Harper 2021 = OF, 2024 = 1B).
- [x] **1.3 Join WAR onto positions.** Merge batting WAR (`war_daily_bat`) and pitching
      WAR (`war_daily_pitch`) onto the position table by player + year + team. Two-way
      players (e.g. Ohtani) yield separate hitting and pitching position-versions.
      *Done when:* each (player, team, year) row carries the correct bWAR for its
      position-version; Ohtani shows both a hitting and a pitching entry.
- [x] **1.4 Map team → current franchise.** Use `Teams.csv` + `TeamsFranchises.csv` so a
      franchise's full history maps to its current identity (e.g. Expos → Nationals).
      *Done when:* drafting the Nationals surfaces Expos-era players; only currently
      existing franchises appear.
- [x] **1.5 Output schema + size budget + emit JSON.** Decide the record shape and a
      filtering rule to keep the file reasonable (e.g. a minimum games/PA threshold to
      drop cup-of-coffee seasons). Write `game-data.json`.
      *Done when:* `game-data.json` exists, loads, and its size is acceptable for a web app.
- [x] **1.6 Validate against known examples.** Acceptance test from the design doc:
      Harper-OF (PHI) ≈ 5.9 from 2021 and Harper-1B (PHI) ≈ 4.6 from 2024; plus a few
      more spot-checks across positions and eras.
      *Done when:* the known values match within rounding.

---

## Phase 2 — Game app (`app/`)

Single-device, two-player hot-seat. All game state lives in the browser for now.

- [x] **2.1 Load data.** App loads `game-data.json`; a small data-access layer can query
      players by franchise, year range, and position. DataProbe.tsx saved as permanent reference.
      *Done when:* a temporary screen can list eligible players for a chosen team + range.
- [x] **2.2 Pre-game setup.** Screen to choose time-range mode: default (all years),
      custom inclusive range, or hard mode (per-round randomized range).
      *Done when:* the chosen settings carry into a game session.
- [x] **2.3 Draft loop skeleton.** 11 rounds, snake order, a random team shown each round,
      no team repeats, dead-end reroll when a team can't fill any open slot.
      *Done when:* a full 11-round turn sequence runs end to end with placeholder picks.
- [x] **2.4 Pick flow.** Within the shown team, search a player, choose a position-version,
      assign it to an open matching slot; award best qualifying WAR for the active range.
      *Done when:* a pick fills the right slot and adds the correct WAR.
- [x] **2.5 Draft rules.** Shared board across both players; no duplicate person; one
      position-version per person; rules enforced.
      *Done when:* once a player (any version) is taken, he's gone for both players.
- [x] **2.6 Lineup cards UI.** Two lineup cards (11 slots each), running WAR totals,
      whose-turn indicator.
      *Done when:* both cards update live as picks happen.
- [x] **2.7 End + scoring.** Game ends when both lineups are full; show totals and winner.
      *Done when:* the higher total is declared correctly.
- [x] **2.8 Responsive polish.** Clean layout on desktop and phone.
      *Done when:* playable and readable on both without horizontal scrolling.

---

## Phase 3 — Ship the local version

- [x] **3.1 Static deploy.** Live at https://mlb-war-draft.vercel.app/ Deploy the static site (e.g. Vercel/Netlify) so it's
      playable worldwide on one device.
      *Done when:* a public URL loads and plays.
      *Gate:* `LICENSING.md` decision must be resolved before this is a **commercial** launch.

---

## Phase 4 — Online multiplayer (future, planned)

Two players on separate devices. Adds a backend service + database for live game state
and real-time syncing. Deliberately deferred; the architecture leaves room for it below
the React app without disturbing the data layer.

- [ ] 4.1 Choose backend + realtime approach
- [ ] 4.2 Game-session storage + sync
- [ ] 4.3 Matchmaking / room codes
- [ ] 4.4 Deploy online version

---

## Cross-cutting tracked tasks

- [ ] **Resolve WAR data licensing** before commercial launch (see `LICENSING.md`)
- [ ] **Confirm Lahman license variant + attribution**
- [ ] **Data size budget** finalized in slice 1.5
- [ ] Revisit deferred rules from `game-design.md` §10 (DH slot, duplicate players,
      mid-season-trade WAR, hard-mode specifics)
