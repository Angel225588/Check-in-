-- ============================================================
-- imarketin check-in platform — canonical schema
-- Project: imarketin (qimhmwkmkbqxsvtayldn), eu-west-3 (Paris, EU/RGPD)
-- Multi-tenant via location_id + RLS deny-by-default. AuthZ claims in JWT app_metadata.
-- This file mirrors migrations 01–07 applied 2026-06-18. Source of truth for the schema.
-- ============================================================

-- Roles (extend later: 'owner', etc.)
do $$ begin
  create type public.app_role as enum ('manager', 'staff');
exception when duplicate_object then null; end $$;

-- ---------- helpers: read tenant + role from JWT app_metadata (user-immutable) ----------
create or replace function public.auth_location_id()
returns uuid language sql stable set search_path = ''
as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'location_id', '')::uuid $$;

create or replace function public.auth_user_role()
returns public.app_role language sql stable set search_path = ''
as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'user_role', '')::public.app_role $$;

create or replace function public.is_manager()
returns boolean language sql stable set search_path = ''
as $$ select public.auth_user_role() = 'manager'::public.app_role $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

-- ============================ TABLES ============================

create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  region      text not null default 'eu-west-3',
  settings    jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.location_members (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  role        public.app_role not null default 'staff',
  label       text,
  created_at  timestamptz not null default now()
);
create index if not exists location_members_location_idx on public.location_members(location_id);

-- Access codes: code_hash = HMAC-SHA256(code, server pepper). One code per (location, role).
create table if not exists public.location_codes (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  role         public.app_role not null default 'staff',
  code_hash    text not null unique,
  auth_user_id uuid references auth.users(id) on delete set null,
  auth_email   text not null,
  label        text,
  active       boolean not null default true,
  last_used_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists location_codes_location_idx on public.location_codes(location_id);

create table if not exists public.auth_attempts (
  id        bigint generated always as identity primary key,
  ip        text,
  code_hash text,
  ok        boolean not null default false,
  at        timestamptz not null default now()
);
create index if not exists auth_attempts_ip_at_idx on public.auth_attempts(ip, at desc);

create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  service_date  date not null,
  status        text not null default 'open',
  totals        jsonb not null default '{}'::jsonb,
  raw_upload_text text,
  device_id     text,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  updated_at    timestamptz not null default now(),
  unique (location_id, service_date)
);
create index if not exists sessions_location_date_idx on public.sessions(location_id, service_date);

create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations(id) on delete cascade,
  session_id   uuid references public.sessions(id) on delete cascade,
  room_number  text not null,
  name         text not null,
  room_type    text,
  rtc          text not null default '',
  confirmation_number text not null default '',
  arrival_date text not null default '',
  departure_date text not null default '',
  reservation_status text not null default '',
  rate_code    text not null default '',
  package_code text,
  is_vip       boolean not null default false,
  vip_level    text,
  vip_notes    text not null default '',
  vip_source   text,
  breakfast_included boolean not null default true,
  pending_payment_action text,
  adults       int not null default 0,
  children     int not null default 0,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists clients_location_session_idx on public.clients(location_id, session_id);
create index if not exists clients_room_idx on public.clients(location_id, room_number);

create table if not exists public.checkins (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  session_id    uuid references public.sessions(id) on delete cascade,
  client_id     uuid references public.clients(id) on delete set null,
  room_number   text,
  client_name   text,
  people_entered int not null default 0,
  payment_action text,
  checked_in_by text default auth.uid()::text,
  device_id     text,
  checked_in_at timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists checkins_location_session_idx on public.checkins(location_id, session_id);

create table if not exists public.notes (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations(id) on delete cascade,
  client_id      uuid references public.clients(id) on delete cascade,
  room_number    text,
  body           text not null,
  author_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_role    public.app_role default public.auth_user_role(),
  pinned         boolean not null default false,
  updated_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists notes_location_client_idx on public.notes(location_id, client_id);

create table if not exists public.morning_briefs (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  brief_date  date not null,
  payload     jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (location_id, brief_date)
);

create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  location_id   uuid,
  actor_user_id uuid,
  action        text not null,
  entity        text,
  entity_id     text,
  detail        jsonb not null default '{}'::jsonb,
  at            timestamptz not null default now()
);
create index if not exists audit_log_location_idx on public.audit_log(location_id, at desc);

-- ---------- updated_at triggers ----------
drop trigger if exists trg_locations_updated on public.locations;
create trigger trg_locations_updated before update on public.locations for each row execute function public.set_updated_at();
drop trigger if exists trg_sessions_updated on public.sessions;
create trigger trg_sessions_updated  before update on public.sessions  for each row execute function public.set_updated_at();
drop trigger if exists trg_clients_updated on public.clients;
create trigger trg_clients_updated   before update on public.clients   for each row execute function public.set_updated_at();
drop trigger if exists trg_checkins_updated on public.checkins;
create trigger trg_checkins_updated  before update on public.checkins  for each row execute function public.set_updated_at();
drop trigger if exists trg_notes_updated on public.notes;
create trigger trg_notes_updated     before update on public.notes     for each row execute function public.set_updated_at();
drop trigger if exists trg_briefs_updated on public.morning_briefs;
create trigger trg_briefs_updated    before update on public.morning_briefs for each row execute function public.set_updated_at();

-- ============================ RLS ============================
-- Enable on ALL tables (deny-by-default). service_role bypasses; anon gets nothing.
alter table public.locations        enable row level security;
alter table public.location_members enable row level security;
alter table public.location_codes   enable row level security;  -- no policies => service-role only
alter table public.auth_attempts    enable row level security;  -- no policies => service-role only
alter table public.app_config       enable row level security;  -- no policies => service-role only
alter table public.sessions         enable row level security;
alter table public.clients          enable row level security;
alter table public.checkins         enable row level security;
alter table public.notes            enable row level security;
alter table public.morning_briefs   enable row level security;
alter table public.audit_log        enable row level security;

create policy locations_select on public.locations
  for select to authenticated using (id = public.auth_location_id());

create policy members_select_self_or_manager on public.location_members
  for select to authenticated
  using (user_id = auth.uid() or (location_id = public.auth_location_id() and public.is_manager()));

-- tenant CRUD pattern for service tables
create policy sessions_select on public.sessions for select to authenticated using (location_id = public.auth_location_id());
create policy sessions_insert on public.sessions for insert to authenticated with check (location_id = public.auth_location_id());
create policy sessions_update on public.sessions for update to authenticated using (location_id = public.auth_location_id()) with check (location_id = public.auth_location_id());
create policy sessions_delete_manager on public.sessions for delete to authenticated using (location_id = public.auth_location_id() and public.is_manager());

create policy clients_select on public.clients for select to authenticated using (location_id = public.auth_location_id());
create policy clients_insert on public.clients for insert to authenticated with check (location_id = public.auth_location_id());
create policy clients_update on public.clients for update to authenticated using (location_id = public.auth_location_id()) with check (location_id = public.auth_location_id());
create policy clients_delete_manager on public.clients for delete to authenticated using (location_id = public.auth_location_id() and public.is_manager());

create policy checkins_select on public.checkins for select to authenticated using (location_id = public.auth_location_id());
create policy checkins_insert on public.checkins for insert to authenticated with check (location_id = public.auth_location_id());
create policy checkins_update on public.checkins for update to authenticated using (location_id = public.auth_location_id()) with check (location_id = public.auth_location_id());
create policy checkins_delete_manager on public.checkins for delete to authenticated using (location_id = public.auth_location_id() and public.is_manager());

create policy notes_select on public.notes for select to authenticated using (location_id = public.auth_location_id());
create policy notes_insert on public.notes for insert to authenticated with check (location_id = public.auth_location_id());
create policy notes_update_author_or_manager on public.notes for update to authenticated
  using (location_id = public.auth_location_id() and (author_user_id = auth.uid() or public.is_manager()))
  with check (location_id = public.auth_location_id());
create policy notes_delete_manager on public.notes for delete to authenticated using (location_id = public.auth_location_id() and public.is_manager());

create policy briefs_select on public.morning_briefs for select to authenticated using (location_id = public.auth_location_id());
create policy briefs_insert on public.morning_briefs for insert to authenticated with check (location_id = public.auth_location_id());
create policy briefs_update on public.morning_briefs for update to authenticated using (location_id = public.auth_location_id()) with check (location_id = public.auth_location_id());

create policy audit_select_manager on public.audit_log for select to authenticated using (location_id = public.auth_location_id() and public.is_manager());
create policy audit_insert on public.audit_log for insert to authenticated with check (location_id = public.auth_location_id());
-- audit_log has no update/delete policies => immutable
