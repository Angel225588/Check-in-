-- One session row per location per service_date, so a "day closed" flag can be
-- upserted and read by every device (close-session-everywhere).
alter table public.sessions
  add constraint sessions_loc_date_uniq unique (location_id, service_date);
