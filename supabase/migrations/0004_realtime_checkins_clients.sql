-- Sync v2: stream check-in + roster changes to connected devices (live, RLS-scoped).
-- Payload carries only ciphertext for PII columns, so zero-knowledge holds over the wire.
alter publication supabase_realtime add table public.checkins;
alter publication supabase_realtime add table public.clients;
