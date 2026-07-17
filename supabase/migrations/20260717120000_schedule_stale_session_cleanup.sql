-- Slice 4.3: schedule the mark_stale_sessions_abandoned() cleanup (added in
-- 4.2 but never wired to a schedule) via pg_cron, entirely inside the
-- database. Decoupled on purpose from the GitHub Actions keep-alive ping --
-- one is an uptime concern, this is data hygiene.
--
-- cron.schedule() with a job name upserts: safe to re-run this migration.

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'mark-stale-sessions-abandoned',
  '0 13 * * 1', -- every Monday at 13:00 UTC, an hour after the keep-alive ping
  $$ select mark_stale_sessions_abandoned(); $$
);
