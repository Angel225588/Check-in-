-- Idempotent client sync.
-- A unique (location_id, client_local_key) lets the app UPSERT the day's clients
-- without creating duplicates on re-upload / auto-sync. client_local_key is a
-- blind index (HMAC of "room|name", key derived from the access code) — deterministic
-- and non-PII. Postgres treats NULLs as distinct, so legacy null-key rows are unaffected.
alter table public.clients
  add constraint clients_loc_localkey_uniq unique (location_id, client_local_key);
