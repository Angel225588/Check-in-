-- Restaurant → "Prévenir la réception": a timestamp reception polls to show a banner
-- ("le restaurant attend le rapport"). Cleared when the roster is uploaded.
alter table public.sessions
  add column if not exists report_requested_at timestamptz;
