-- Slice 4.1: leaderboard hardening.
--
-- Removes the permissive open-insert policy on daily_scores (anyone could
-- insert an arbitrary row directly, including a fabricated score, with no
-- server-side validation at all). All writes now go through the
-- `submit-score` Edge Function, which recomputes the score from the
-- submitted lineup against the deterministic daily schedule and game data
-- before inserting with the service role (which bypasses RLS by design --
-- it IS the trusted writer now). Public reads are unchanged.
--
-- Run this in the Supabase SQL Editor (or via `supabase db push` once the
-- CLI is set up locally -- this repo didn't have one before this slice).

-- 1. Lock down direct inserts. The old policy (from the original session
--    that stood this table up) was permissive: `insert with check (true)`.
drop policy if exists "Anyone can insert scores" on daily_scores;

-- No replacement insert policy for the anon/authenticated roles -- direct
-- table inserts from the app's anon key now fail. The Edge Function uses
-- the service role key, which bypasses RLS entirely, so it doesn't need a
-- policy here.

-- Public reads stay exactly as they were.
-- (Re-asserting for clarity/idempotency; safe to run even if it already exists.)
drop policy if exists "Anyone can read scores" on daily_scores;
create policy "Anyone can read scores"
  on daily_scores for select
  using (true);

-- 2. One submission per username per (date, mode), enforced at the DB
--    level so a race between two near-simultaneous requests can't both
--    succeed (the Edge Function also checks this before inserting, but a
--    DB constraint is the only way to make it airtight).
alter table daily_scores
  add constraint daily_scores_one_per_user_per_day
  unique (date, username, mode);

-- 3. Basic per-IP rate limiting for the submit-score function. Not part of
--    daily_scores itself -- this tracks every submission *attempt*
--    (successful or rejected), so it can catch abuse that never makes it
--    into daily_scores at all. RLS enabled with no public policies: only
--    the service role (used exclusively by the Edge Function) can read or
--    write this table.
create table if not exists submission_attempts (
  id uuid default gen_random_uuid() primary key,
  ip text not null,
  created_at timestamptz default now()
);

create index if not exists submission_attempts_ip_created_idx
  on submission_attempts (ip, created_at desc);

alter table submission_attempts enable row level security;
-- No policies added -- RLS with zero policies means zero access for the
-- anon/authenticated roles; only the service role (which bypasses RLS)
-- can touch this table.
