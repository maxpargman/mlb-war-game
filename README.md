# MLB WAR Draft

A two-player hot-seat browser game where players draft real MLB players by Wins Above Replacement (WAR).

**Live:** https://mlb-war-draft.vercel.app/

## How to play

1. Choose a time range (All Time, Custom Range, or Hard Mode)
2. Each round, a random MLB franchise is revealed
3. Players take turns drafting one player from that franchise to fill a lineup slot
4. Snake draft order — turn order reverses each round
5. 11 rounds, 11 slots per player: C, 1B, 2B, 3B, SS, OF, OF, OF, P, P, P
6. Each pick scores the player's best WAR season for that franchise within the active time range
7. Highest total WAR wins

## Data sources

- **WAR:** Baseball-Reference (bWAR)
- **Player/team history:** Lahman Baseball Database (CC BY-SA 3.0)

## Dev setup

```bash
# Data pipeline (requires Python + conda env `mlbwar`)
conda activate mlbwar
python data/build_game_data.py

# App
cd app
npm install
npm run dev
```
