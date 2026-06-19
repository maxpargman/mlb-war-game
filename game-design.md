# MLB WAR Draft — Game Design Document

*Version 0.1 — rules and gameplay only. No development or technical specifications.*

---

## 1\. Overview

A two-player game played on a single shared device. Players take turns drafting real MLB players to fill an 11-slot lineup. Each round, a random MLB team is shown, and the drafting player selects an eligible player from that team to occupy one of their open lineup slots. Each drafted player contributes their Wins Above Replacement (WAR) to the player's running total. **The player with the highest total WAR at the end of the draft wins.**

The two players draft from a single shared pool: once a player is taken by either person, he is unavailable to both for the rest of the game.

---

## 2\. The Lineup

Each player fills exactly **11 slots**:

**8 position-player slots**

- Catcher (C)  
- First Base (1B)  
- Second Base (2B)  
- Third Base (3B)  
- Shortstop (SS)  
- Outfield (OF)  
- Outfield (OF)  
- Outfield (OF)

**3 pitcher slots**

- Pitcher (P)  
- Pitcher (P)  
- Pitcher (P)

There is no Designated Hitter in this version. Any pitcher (starter or reliever) may fill any of the three pitcher slots.

---

## 3\. The Draft

The draft runs for **11 rounds**, one per lineup slot, until both players have completely filled their lineups.

**Turn order is snake:** the order reverses each round. (e.g., Round 1: Player A then Player B; Round 2: Player B then Player A; Round 3: A then B; and so on.)

**Each round shows one randomly selected MLB team.** Both players drafting in that round choose from that same team. A team that has already appeared cannot appear again later in the game (no team repeats).

---

## 4\. Making a Pick

On their turn, the drafting player chooses **any eligible player from the shown team**, and assigns that player to **any open slot in their lineup that matches the player's position** for the chosen position-version (see below). The player is free to fill slots in any order across rounds — the round does not dictate which position must be filled. The only constraint is that they must have an open slot for the position they are drafting.

### Position versions

A real player may have played different primary positions in different seasons. Each player is offered to the user as one or more **position-versions**, based on the position he played in the majority of games in a given qualifying season.

- Each position-version is selectable independently and carries its own WAR value (see Section 5).  
- Example: within an eligible time range, Bryce Harper could be offered as **Harper-OF** and **Harper-1B**, because he had qualifying seasons primarily at each position for that franchise. The user picks one version, which fills the matching slot and adds that version's WAR.  
- **A person may only be drafted once per game.** If Harper-1B is taken, Harper-OF is no longer available — to either player.

---

## 5\. WAR Scoring

- WAR is sourced from **Baseball-Reference (bWAR)**.  
- When a player is drafted, the WAR added is the **single highest qualifying season** that player recorded **while playing for that franchise, at that position-version, within the active time range.**  
- "Qualifying" means a season in which the chosen position was the player's primary position (most games played at that position that year).  
- Note on mid-season trades: for a season split between two teams, **only the WAR earned with the specific drafted franchise counts.** *(Flagged for revisiting later — see Section 9.)*

WAR data is available for essentially all of MLB history (Baseball-Reference computes it retroactively back to 1871), so there is no historical era that lacks WAR values.

---

## 6\. Teams and Franchises

- The random team pool draws from **current MLB franchises.**  
- A franchise's **entire history is eligible**, including former names, as long as the franchise still exists today. A team is shown under its **current name**, and players from any era of that franchise may be drafted.  
  - Example: drafting the **Nationals** makes eligible any player from the franchise's history, including the **Montreal Expos** era (1969–2004).

---

## 7\. Time Range Settings

The set of eligible player-seasons is governed by a time range, chosen before the game starts.

- **Default:** no restriction — any season a player played for the shown franchise is eligible.  
- **Custom range:** players set an inclusive year range (e.g., 2010–2020). Only seasons within that range count, both for eligibility and for the WAR value awarded.  
  - Example: with a 2010–2020 range, a player is only draftable if he played for the shown team in at least one season from 2010 through 2020 inclusive, and the WAR awarded is his best qualifying season *within that window* for that team/position.

---

## 8\. Game Rules and Edge Cases

- **Shared pool:** one global board across both players. A drafted player (and all of his position-versions) is removed for both players.  
- **No duplicate people:** a given real player may appear in only one lineup, in only one slot, once per game.  
- **No team repeats:** each franchise can be shown at most once per game.  
- **Snake order** applies to turn sequence.  
- **Dead-end rounds:** if the shown team cannot fill any of the drafting player's remaining open slots, that team is skipped and a new random team is drawn for that pick.  
- **Two-way players:** a two-way player's hitting and pitching are separately draftable position-versions (e.g., a hitting version carrying batting WAR, or a pitching version carrying pitching WAR), but only one version may be drafted, consistent with the no-duplicate-people rule.

---

## 9\. Difficulty / Future Modes

- **Hard mode (planned):** randomizes the time range for each individual draft round in addition to the team, and may allow players to configure how the range is randomized.

---

## 10\. Open Items — To Revisit Later

These are intentionally deferred and not part of the current ruleset:

1. **Designated Hitter slot** — a possible additional slot fillable by any hitter.  
2. **Allowing duplicate players** — currently both players cannot share a player and Harper-1B/Harper-OF are mutually exclusive; this may be relaxed.  
3. **Mid-season trade WAR handling** — currently only the WAR earned with the drafted franchise counts; to be reconsidered.  
4. **Hard mode specifics** — exact behavior of randomized/user-set per-round time ranges.

---

*End of design document v0.1.*  
