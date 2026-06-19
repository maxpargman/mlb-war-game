# WAR Data Licensing — Options and Decision

*Status: OPEN. This must be resolved before any commercial launch. It does not block development.*
*Note: this is a planning summary, not legal advice. Confirm terms with each provider and a lawyer before launch.*

---

## The core issue

Individual facts (a stat) are not copyrightable, but a **compiled WAR dataset** and a **product built on someone's data** are restricted. Our game wants season-by-season WAR going back decades, ideally the recognizable "back-of-the-card" number — which narrows the realistic sources.

The **positions and franchise data** (Lahman / Chadwick databank) is openly licensed for commercial use **with attribution** — confirm the exact Creative Commons variant before launch. That half is clean. The open question is only the WAR metric.

---

## Options

### 1. License bWAR from Baseball-Reference (Sports Reference LLC)
- **What:** the exact metric we designed around, full history to 1871.
- **Terms:** reuse welcomed *with credit*, but building a tool/site on their data or copying a materially significant portion needs permission. Custom data requests start at a $5,000 minimum.
- **Cost:** negotiated commercial license, not publicly listed — realistically four-to-five figures. Email them early to get a real number.
- **Fit:** best if the *brand* of bWAR matters to the game.

### 2. FanGraphs (fWAR)
- **What:** alternative WAR.
- **Terms:** no API, no scraping, no export beyond one-click member exports — there is no commercial feed to license.
- **Fit:** not a viable data-feed path.

### 3. Commercial sports-data API (SportsDataIO, Sportradar, DataFeeds, etc.)
- **What:** sabermetric feeds that can include WAR, but often *their* WAR variant and often limited historical depth.
- **Terms:** standard B2B subscription, clean commercial rights.
- **Cost:** entry game-data tiers ~$100/mo (pre-game) to ~$400/mo (live); full sabermetric + deep-historical is enterprise "contact sales," commonly $1k+/mo.
- **Fit:** best if we later add live current-season play; weaker for a deep historical draft.

### 4. MLB Stats API / Baseball Savant
- **What:** highest-fidelity raw MLB data plus a sabermetrics WAR endpoint, modern era only.
- **Terms:** MLB's own terms; commercial use needs care/permission.
- **Cost:** free to pull; the catch is commercial rights and limited history.

### 5. Compute our own WAR
- **What:** our own metric from free Retrosheet / Lahman / Statcast inputs, any history we want.
- **Terms:** we own the output outright — no metric licensing.
- **Cost:** $0 data cost; cost is engineering time (a real sub-project).

---

## Recommendation

Only two options preserve "real bWAR, full history": **license it from Baseball-Reference (Option 1)** or **compute our own (Option 5)**. Everything else forces a different/limited WAR or doesn't go back far enough for the timeline mechanic.

- If bWAR specifically matters → pursue Option 1; contact Baseball-Reference early.
- If any consistent WAR is acceptable → Option 5 removes the licensing question but adds a build phase.
- Commercial APIs (Option 3) are a fit mainly if/when live current-season play is added.

---

## Decision log

- [ ] Decide WAR source for the commercial product (owner: Max + partner)
- [ ] If Option 1: contact Baseball-Reference for a license quote
- [ ] Confirm Lahman/Chadwick license variant + add required attribution
- [ ] Final sign-off that shipped data is commercially cleared
