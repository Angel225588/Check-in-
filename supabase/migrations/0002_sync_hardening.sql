-- ============================================================
-- 0002_sync_hardening — make the schema safe for offline-first sync.
-- Resolves adversarial findings R4 (LWW clock), R6 (delete safety), plus
-- SQL-enforced monotonic rev, sticky tombstones, soft-delete authz, audit integrity.
-- Project: imarketin (qimhmwkmkbqxsvtayldn), eu-west-3.
-- ============================================================

-- R4: client-authored LWW clock. Server updated_at is before-update only, so it
-- only reflects "last flush", not "last edit" -> it can NOT be the LWW clock.
-- client_rev is bumped once per local user edit and is the authoritative clock.
alter table public.clients   add column if not exists client_rev bigint not null default 0;
alter table public.checkins  add column if not exists client_rev bigint not null default 0;
alter table public.sessions  add column if not exists client_rev bigint not null default 0;

-- clients needs device_id (tiebreak) + client_local_key (first-contact cross-device match)
alter table public.clients   add column if not exists device_id text;
alter table public.clients   add column if not exists client_local_key text;
create index if not exists clients_local_key_idx on public.clients(location_id, client_local_key);

-- R6: sessions become tombstonable; child FKs must NOT cascade-hard-delete.
alter table public.sessions  add column if not exists deleted_at timestamptz;
alter table public.clients   drop constraint if exists clients_session_id_fkey;
alter table public.clients   add  constraint clients_session_id_fkey
  foreign key (session_id) references public.sessions(id) on delete set null;
alter table public.checkins  drop constraint if exists checkins_session_id_fkey;
alter table public.checkins  add  constraint checkins_session_id_fkey
  foreign key (session_id) references public.sessions(id) on delete set null;

-- Forbid manager HARD delete of sessions; deletes go through tombstone UPDATE.
drop policy if exists sessions_delete_manager on public.sessions;

-- guard_row_write: monotonic client_rev + sticky tombstone + watermark stamp.
-- Replaces set_updated_at on the three sync tables (it also stamps updated_at).
create or replace function public.guard_row_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- never move the LWW clock backwards (stale re-flush is a no-op)
  if new.client_rev < old.client_rev then
    return old;
  end if;
  -- sticky tombstone: a write at <= rev can never clear a delete
  if old.deleted_at is not null and new.deleted_at is null
     and new.client_rev <= old.client_rev then
    new.deleted_at := old.deleted_at;
  end if;
  -- pull watermark advances only on an accepted change
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_clients_updated  on public.clients;
drop trigger if exists trg_checkins_updated on public.checkins;
drop trigger if exists trg_sessions_updated on public.sessions;
drop trigger if exists trg_clients_guard  on public.clients;
create trigger trg_clients_guard  before update on public.clients  for each row execute function public.guard_row_write();
drop trigger if exists trg_checkins_guard on public.checkins;
create trigger trg_checkins_guard before update on public.checkins for each row execute function public.guard_row_write();
drop trigger if exists trg_sessions_guard on public.sessions;
create trigger trg_sessions_guard before update on public.sessions for each row execute function public.guard_row_write();

-- Client soft-delete is manager-only (staff may tombstone checkins, not clients).
-- Managers, the service role, and trusted server/migration contexts (no JWT) are allowed.
create or replace function public.deny_staff_client_softdelete()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    if not public.is_manager()
       and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
       and auth.jwt() is not null then
      raise exception 'client soft-delete is manager-only';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_clients_softdelete_guard on public.clients;
create trigger trg_clients_softdelete_guard before update on public.clients
  for each row execute function public.deny_staff_client_softdelete();

-- Audit integrity: the actor cannot be spoofed by the client.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (location_id = public.auth_location_id() and actor_user_id = auth.uid());
