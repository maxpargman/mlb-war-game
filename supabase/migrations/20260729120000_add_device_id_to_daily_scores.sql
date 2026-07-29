-- Slice 4.4: correlate leaderboard submissions back to a device/session.
--
-- Same device_id already used by game_sessions (4.2), generated client-side
-- in app/src/deviceId.ts. Nullable and only lightly validated by
-- submit-score -- this is correlation metadata, not an anti-cheat control,
-- so a missing/malformed value never blocks a legitimate score submission.

alter table daily_scores add column if not exists device_id text;

create index if not exists daily_scores_device_idx on daily_scores (device_id);
