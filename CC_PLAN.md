# CC_PLAN.md — The WAR Room (formerly MLB WAR Draft)

This file is the source of truth for Claude Code sessions. It replaces `PLAN.md`.
Companion doc for the human: `Max_Plan.md` (decisions, costs, Max's own action items).

**Repo:** github.com/maxpargman/mlb-war-game · **Live:** https://mlb-war-draft.vercel.app/
**Stack:** Vite + React + TypeScript (`app/`), Supabase (leaderboard), Python/pandas pipeline (`data/`), Vercel deploy (root = `app/`, push to `master` = production).

---

## Working protocol (read first, every session)

1. Do **only the next unchecked slice**. Do not start the one after it.
2. All work happens on a branch (e.g. `dev` or a short-lived feature branch), never directly on `master`. Vercel generates a preview URL per branch push — that preview is how Max verifies.
3. When the slice is done, **stop** and report: what changed, which files, the preview URL if applicable, exact steps for Max to verify, and test-suite status ("all N tests passing").
4. **Wait for Max's sign-off.** Do not check the box, merge, or move on without it.
5. On sign-off: check the box, merge to `master`, commit with a clear message, stop.
6. On rejection: fix within the same slice, return to step 3.
7. If anything is ambiguous or requires a decision, ask — don't guess.
8. Once the test suite exists (Slice 2.1): any slice that changes game logic must add/update relevant tests **within that slice** and run the full suite before reporting. Keep tests minimal and targeted — no UI/browser tests, no coverage targets.

## Explicitly OUT of scope — do not build, suggest, or scaffold for these

- Online multiplayer (permanently dropped)
- User accounts / authentication
- Streak tracking (dropped)
- bWAR licensing work (handled externally; build as if the license is secured)
- Ad network integration, privacy policy, consent banners (launch-gated, not now)
- Per-player named assertions in automated tests (per Max: holistic/structural checks only; individual players are verified manually by Max)
- Multi-metric gameplay (stat selection, stat-based daily modes) — data is ingested in Phase 3, but no game/UI/scheduler/leaderboard work until a design conversation with Max produces a new phase.

---

## Phase 0 — Housekeeping

- [x] **0.1 Commit the `#probe` dev-gate.** The `import.meta.env.DEV` gate for the `#probe` diagnostic screen is sitting uncommitted in `app/src/main.tsx`. Finish/verify it (probe reachable in dev, stripped from production bundle), commit.
  *Done when:* production build contains no probe code; dev build still serves it at `#probe`.

---

## Phase 1 — Diagnosis (missing-player reports)

Reported missing by users: **Robin Yount (Brewers), Nick Kurtz (Athletics), Frank Thomas (White Sox), Jeff Bagwell (Astros)** — plus a general report of "lots more Brewers missing." All four DO appear in the `#probe` screen, which reads the same `game-data.json` via the same query path as the game. So the failure may be in search/UX rather than data. Diagnose before rebuilding.

- [x] **1.1 Reproduce and classify.** For each reported player: query `#probe` and the actual game pick-flow with **identical** franchise + year-range parameters (test all-time AND narrow daily-style windows). Separately, test the PickPanel search box against normalization hazards: suffixes ("Griffey Jr"), accents ("Peña"/"Pena"), apostrophes, case, partial names. Also verify the deployed site's `game-data.json` matches the current pipeline output (stale-deployment check).
  *Done when:* each reported case is classified into one of: (a) data genuinely absent, (b) search-matching failure, (c) context/UX mismatch (player exists but not in the active year window / slot), (d) stale deployed data — with evidence for each. Report findings; Max decides on any search/UX fixes as follow-up slices.
- [x] **1.2 (Conditional) Search normalization fix.** If 1.1 finds search failures: normalize both sides of the match (case-fold, strip accents/diacritics, handle punctuation, match with and without suffix). Add tests once suite exists.
  *Done when:* every classified search-failure case is findable in the game UI.

---

## Phase 2 — Test foundation

- [x] **2.1 Vitest setup + core suite.** Add Vitest (dev-dependency only, nothing deployed). Cover: `engine.ts` (snake order, no duplicate person across both boards, one position-version per person, dead-end detection, applyPick immutability), `daily.ts` (same date+mode ⇒ identical schedule; different dates differ; mode offsets work), and `data.ts` core queries (best-WAR-per-player/position within franchise + year range). Keep it lean — test rules whose breakage is expensive and hard to notice. No UI tests.
  *Done when:* suite runs in seconds via one command; all tests pass; README notes the command.

---

## Phase 3 — Data pipeline rebuild (HIGHEST PRIORITY workstream)

**Architecture: two layers.**
- **Layer 1 — canonical dataset (Parquet):** complete, season-grain, nothing game-specific, nothing dropped.
- **Layer 2 — app view (`game-data.json`):** generated from Layer 1 by one config-driven script that applies current game-design choices.

**Directory rules:** all new code in `data/pipeline_v2/`; canonical output in `data/canonical/`; generated JSON in a versioned build folder. **Do not modify or delete the old scripts or their outputs** until the final swap slice is signed off; then archive-commit and remove the old pipeline.

### Canonical layer spec

- **Grain:** one row per `(bbrefID, year, teamID)`. Mid-season trades = one row per team with that team's WAR share.
- **Spine:** `bbrefID` (the WAR files are the source of record; Lahman enriches them — not the reverse).
- **Columns:** bbrefID, Lahman playerID (nullable), full display name **with suffix**, year, Lahman teamID, era-accurate team name (from `Teams.csv`, per year), franchID (year-aware), batting WAR and pitching WAR as **separate columns**, total games, and **granular per-position game counts** (`G_c, G_1b, G_2b, G_3b, G_ss, G_lf, G_cf, G_rf, G_of, G_dh, G_p`, as available from `Appearances.csv`).
- **No games-played threshold. No DH-drop. No OF-collapsing. Nothing deleted, ever.** Those are view-layer decisions.
- **Stat columns (multi-metric support):** in addition to WAR, ingest Lahman
  `Batting.csv` and `Pitching.csv` and carry their counting stats on the same
  (bbrefID, year, teamID) rows. Batting: at minimum G, AB, H, 2B, 3B, HR, RBI,
  SB, CS, BB, SO — carry all counting-stat columns present; they are cheap in
  Parquet and the canonical layer is complete-by-policy. Pitching: at minimum
  W, L, G, GS, SV, IPouts, H, ER, HR, BB, SO. For rate stats (ERA etc.), store
  raw components only (ER, IPouts) — never precomputed ratios; qualification
  rules and ratio math are view-layer concerns. Mid-season trades follow the
  existing grain: one row per team with that team's stat totals.

### Ingestion rules

- **ID resolution:** join WAR rows to Lahman via `People.csv.bbrefID`, exact match only. Unresolved rows go to an **exceptions table with a reason code** — never a silent fallback. Reason codes (closed set): `pre_lahman_era`, `lahman_lag`, `unmapped_team_year`, `invalid_suffix_rejected`, `non_mlb_league`, `unknown`. Pre-1900 fallback handling is explicit/whitelisted; a modern player landing in fallback is an error.
- **Lahman-lag players (recent debuts with no Lahman row yet) are KEPT**, named from the WAR file's own name column, flagged for enrichment on the next Lahman release. Do not drop them.
- **Team mapping:** no hand-maintained dict. Build a year-aware `(BR code, year) → (Lahman teamID, yearID)` mapping table, seeded from `Teams.csv`'s `teamIDBR` column, then **verified** per team-season by checking that BR's and Lahman's player sets for that team-year overlap above a high threshold. Poor overlap ⇒ hard failure printing both rosters. (This is what makes Brewers `ML4`/`MIL` and Athletics `ATH`-class problems structural non-events.)
- **Suffixes (required feature), three tiers:**
  1. Chadwick register (`key_bbref → name_suffix`), validated against an allowlist pattern (Jr., Sr., II–IV, …). Non-conforming values rejected by rule and logged (kills the "David Armstrong"/"Eli" garbage class without hardcoded name lists).
  2. Manual overrides move out of code into versioned `overrides.csv` (bbrefID, suffix, comment/reason). Apply with a **staleness check**: if the register now agrees with an override, warn that the override is removable.
  3. Otherwise no suffix.
  Display name assembled once, in the canonical layer.
- **Two-way players:** NOT split in the canonical layer — one row per (player, year, team) carrying both WAR columns and granular position games. Splitting into position-versions (and re-deriving hitting position excluding pitcher games) happens in the view generator.
- `Batting.csv`/`Pitching.csv` join on Lahman (playerID, yearID, teamID) after
  ID resolution, and are subject to the same gates: intake counts (Gate 1),
  conservation with reason codes (Gate 2), and coverage checks (Gate 3) extended
  so WAR rows and stat rows reconcile — a (player, year, team) row that exists
  in the WAR data but finds no Batting/Pitching match (or vice versa) goes to
  an exceptions bucket, never silently dropped or silently NULLed.

### Completeness gates (all built into the pipeline; run every build)

- **Gate 1 — intake:** record row/player counts + year ranges per raw file; schema assertions (expected columns/types) so source-format changes fail loudly.
- **Gate 2 — conservation:** at every stage boundary, `rows_in == rows_out + rows_excluded_with_reason`. **`unknown` bucket > 0 ⇒ build fails.**
- **Gate 3 — canonical coverage:** every franchise × every year of its existence (derived from `Teams.csv`, not hand-maintained) has rows; per-team-season player counts within sane bounds (~25–60, looser pre-1900); cross-source roster-agreement check per team-year; exactly 30 active franchises; no duplicate `(bbrefID, year, teamID)` keys.
- **Gate 4 — view reconciliation:** canonical rows in = app rows out + excluded-with-reason (currently expected: DH-only seasons, inactive franchises). Emitted JSON invariants: 30 franchises, all position codes, ≤ ~3 MB gzipped, embedded **build stamp** (date + canonical version).
- **Gate 5 — reconciliation report:** one human-readable report per build: source→canonical→app counts, every exclusion bucket with counts + sample rows, coverage results, mapping verifications, diff vs previous build. Plus a **per-franchise audit workbook** (one sheet per franchise: year coverage with gaps highlighted, players per season, era-by-era top-WAR players) for Max's manual verification against Baseball-Reference.
- Fail vs warn: unexplained loss, coverage gaps, dup keys, roster-agreement misses ⇒ **fail (no JSON emitted)**. Lahman-lag count changes, stale overrides, size drift ⇒ **warn loudly in report**.

### View generator spec

- One script: Parquet → `game-data.json`, all game-design choices in a versioned config file (`view_config.yaml`): OF-collapse ON, DH-only seasons excluded from draft eligibility, two-way splitting ON, franchise mapping, compact key map. Future design changes (DH slot, LF/CF/RF split) must require **config edits only**.
- Include era-accurate team name as a field (e.g. app can show "Gary Carter — Expos" within a Nationals draft).
- **No games-played threshold in the app data** (decided): all seasons ship; fringe seasons are draftable at their true WAR. Complete stints also serve the years-in-dropdown feature.
- Output **auto-copies** into `app/public/` — the manual copy step is eliminated.
- Expected size ≈ 3 MB gzipped (~110K rows). Acceptable; do not build lazy-loading/splitting now.
- The generator emits **NO stat columns** to `game-data.json` yet — multi-metric gameplay is a future, design-gated feature. Emitting stats later must require only config changes.
- **Display-name override, Angels franchise (ANA):** Lahman's `Teams.csv` lists this franchise's name as "Los Angeles Angels of Anaheim" all the way through its latest (2025) row — confirmed by inspection, not just stale data lag. The UI-facing franchise name should show as **"Los Angeles Angels"** instead. This is a view-layer display override only — canonical/intermediate data (franchID, era-accurate historical team names, etc.) stays exactly as Lahman has it. Add an explicit override in `view_config.yaml`'s franchise mapping (franchID ANA → display name "Los Angeles Angels"), not a change to any upstream source or canonical column.

### Slices

- [x] **3.1 Scaffold + intake.** `pipeline_v2/` structure, raw-file loaders (including the new `Batting.csv`/`Pitching.csv` stat sources), Gate 1 intake counts + schema assertions.
- [x] **3.2 Team mapping table.** Year-aware mapping from `teamIDBR`, roster-overlap verification, exceptions for unmapped (code, year).
- [x] **3.3 ID resolution + WAR ingestion.** bbrefID spine, exceptions table with reason codes, Lahman-lag retention with BR names. Also joins `Batting.csv`/`Pitching.csv` counting stats onto the same rows, subject to the same gates (see Ingestion rules).
- [x] **3.4 Names + suffixes.** Three-tier suffix system, `overrides.csv`, staleness check, display-name assembly.
- [x] **3.5 Canonical assembly + gates.** Full Parquet emit with Gates 2–3 enforced; first reconciliation report + audit workbook.
- [x] **3.6 Max's manual franchise audit.** Max reviews the workbook against Baseball-Reference (Brewers first: coverage 1969–present, Yount 1974–1993 present). Pipeline fixes iterate within this slice until Max signs off on all 30 franchises.
- [x] **3.7 View generator.** Config-driven JSON emit, Gate 4, build stamp, auto-copy.
- [x] **3.8 One-command refresh.** Single entry point (`make refresh` or `run_pipeline.py`): ingest → gates → Parquet → JSON → copy → report. Document the annual-update ritual in the repo.
- [x] **3.9 Data swap (gated).** Branch commit of the new `game-data.json`; Max verifies on the preview URL (search previously-reported players, dropdown behavior, spot checks) with the reconciliation report in hand; on sign-off, merge. Then archive-commit and delete the old pipeline scripts.

---

## Phase 4 — Backend hardening & session tracking (Supabase)

- [x] **4.1 Leaderboard hardening.** Remove the permissive open-insert RLS policy on `daily_scores`. All writes route through a **Supabase Edge Function** that: recomputes the score server-side by validating the submitted lineup against the deterministic daily schedule (same seeded-PRNG logic as `daily.ts`), enforces one submission per username per (date, mode), sanitizes usernames (length cap, strip control chars/garbage), and applies basic rate limiting. Public reads unchanged.
  *Done when:* direct table inserts are rejected; a legitimate submission through the app works end-to-end; an impossible score is rejected.
- [x] **4.2 Anonymous session tracking.** On first visit, generate a device UUID in localStorage. New `game_sessions` table: **one row per game**, created at first pick, updated per pick — fields: device ID, mode/difficulty, date, status (`in_progress`/`completed`/`abandoned`), lineup JSON, score, timestamps. **Both daily and 2-player hot-seat games are logged** (hot-seat: unlimited plays, analytics only). Writes go through a validating Edge Function (same pattern as 4.1), never open table writes. Every completed daily logs automatically, independent of the optional named leaderboard submission.
- [x] **4.3 Keep-alive ping.** Scheduled GitHub Actions cron (weekly) that runs a trivial Supabase query, preventing free-tier pause-after-inactivity.
- [ ] **4.4 Add `device_id` to `daily_scores`.** Same column as `game_sessions`, populated by `submit-score` from the request body (device UUID already generated client-side in `session.ts`). Lets leaderboard rows be correlated back to a session/device.

---

## Phase 5 — Features & product

- [x] **5.1 Rename to "The WAR Room".** On-screen title, browser tab/meta/OG tags, share-button text, README. (Domain purchase/connection is Max's task — see Max_Plan.md; when the domain exists, update share URLs and meta accordingly in a follow-up.)
- [ ] **5.2 Daily persistence + replay lock + resume.** localStorage saves per (date, difficulty): **lock-on-start with resume** — starting a daily locks that (date, difficulty); an interrupted game reopens exactly where it stopped (state restored from localStorage); a completed daily shows the player's result (lineup + score) and the leaderboard, with no replay path. Lock is **per difficulty** (finishing Medium still allows Easy/Hard that day). Day boundary: one global boundary consistent with the daily seed's date string (recommend US Eastern midnight; keep consistent everywhere). No streak display.
- [ ] **5.3 Skip feature.** Daily challenge, **Medium and Hard only**: one skip per **game**, free, no penalty. Skipping replaces both the franchise AND the year window using a **pre-generated deterministic backup sequence** (seeded like the main schedule, so all players skipping round N land on the identical replacement). Backup picks must respect the no-repeat-franchise rule against franchises already shown that day. Add engine/scheduler tests.
- [ ] **5.4 Years in search dropdown.** In PickPanel results, show each player's stint years with the current franchise, computed at runtime from the (now gapless) data, formatted with gap awareness: "2001–2004, 2007–2010".
- [ ] **5.5 Instructions popup.** Auto-shows on first visit only (localStorage flag); closable; reopenable anytime via a persistent "How to play" button. Content: the goal, WAR in one sentence, snake-draft mechanics, the daily challenge. Keep it brief and mobile-clean.
- [ ] **5.6 Ad layout reservation.** CSS-only: reserve a bottom banner zone (all viewports) and side-rail zones (desktop) so future ad units drop in without layout rework. **No ad code, no network integration.** Layout must remain clean with the zones empty.

---

## Notes for all sessions

- The 11-slot lineup (C, 1B, 2B, 3B, SS, OF, OF, OF, P, P, P — no DH) and current draft rules are unchanged by this plan.
- Game-design presentation changes (DH slot, OF split) are future *config* changes in the view generator — never re-ingestion.
- When users report a missing player, first question is always: canonical layer or view? Check Parquet, then JSON, then search/UX.
