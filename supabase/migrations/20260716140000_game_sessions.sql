-- Slice 4.2: anonymous session tracking.
--
-- New game_sessions table: one row per game (both daily and 2-player
-- hot-seat), created at the first pick and updated as the game progresses.
-- This is analytics data, not leaderboard-critical -- unlike daily_scores,
-- nothing here is ever displayed back to users or used to rank anyone, so
-- the Edge Function that owns this table (track-session) does light
-- structural/bounds validation rather than full game-rule recomputation.
--
-- Run this in the Supabase SQL Editor (or `supabase db push`).

create table if not exists game_sessions (
  id uuid default gen_random_uuid() primary key,
  device_id text not null,
  game_type text not null check (game_type in ('daily', 'hotseat')),
  mode text not null,
  date date not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  lineup jsonb not null,
  score numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists game_sessions_device_idx on game_sessions (device_id, created_at desc);
create index if not exists game_sessions_status_idx on game_sessions (status, updated_at);

alter table game_sessions enable row level security;
-- No policies -- RLS with zero policies means zero access for anon/
-- authenticated roles. Only the service role (used exclusively by the
-- track-session Edge Function) can read or write this table. This is
-- intentionally never publicly readable, unlike daily_scores.

-- Marks stale in_progress sessions as abandoned. Not wired to a schedule
-- yet -- pairs naturally with slice 4.3's cron (keep-alive ping), which
-- could call this too, or a separate pg_cron job. Safe to run manually or
-- repeatedly in the meantime; only touches rows past the staleness window.
create or replace function mark_stale_sessions_abandoned(staleness_hours int default 24)
returns int
language sql
as $$
  with updated as (
    update game_sessions
    set status = 'abandoned'
    where status = 'in_progress'
      and updated_at < now() - (staleness_hours || ' hours')::interval
    returning 1
  )
  select count(*)::int from updated;
$$;

-- Reused by track-session for rate limiting, same table slice 4.1 added,
-- now tagged by which function logged the attempt so a busy but legitimate
-- endpoint (many picks per game) doesn't share a budget with a
-- once-a-day endpoint (one leaderboard submission).
alter table submission_attempts add column if not exists endpoint text not null default 'submit-score';
