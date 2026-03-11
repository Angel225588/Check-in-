-- Check-in PWA — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- =============================================================
-- SESSIONS
-- =============================================================
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  date text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  property_code text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- =============================================================
-- CLIENTS
-- =============================================================
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  room_number text not null,
  room_type text not null default '',
  rtc text not null default '',
  confirmation_number text not null default '',
  name text not null,
  arrival_date text not null default '',
  departure_date text not null default '',
  reservation_status text not null default '',
  adults int not null default 0,
  children int not null default 0,
  rate_code text not null default '',
  package_code text not null default '',
  is_vip boolean not null default false,
  vip_level text not null default '',
  vip_notes text not null default '',
  breakfast_included boolean not null default true,
  payment_action text check (payment_action in ('points', 'room_charge', 'pay_onsite', 'pass')),
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_session on clients(session_id);
create index if not exists idx_clients_room on clients(room_number);

-- =============================================================
-- CHECK-INS
-- =============================================================
create table if not exists check_ins (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  room_number text not null,
  client_name text not null,
  people_entered int not null default 1,
  checked_in_by text,
  timestamp timestamptz not null default now()
);

create index if not exists idx_checkins_session on check_ins(session_id);
create index if not exists idx_checkins_room on check_ins(room_number);

-- =============================================================
-- PDF UPLOADS
-- =============================================================
create table if not exists pdf_uploads (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  file_name text not null,
  file_url text not null default '',
  doc_type text not null default 'unknown' check (doc_type in ('clients', 'vip', 'unknown')),
  raw_text text not null default '',
  extraction_data jsonb not null default '{}',
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'discrepancies')),
  verification_report jsonb,
  pages int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_uploads_session on pdf_uploads(session_id);

-- =============================================================
-- BILLING RECORDS
-- =============================================================
create table if not exists billing_records (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  room_number text not null,
  client_name text not null,
  action text not null check (action in ('points', 'room_charge', 'pay_onsite', 'pass', 'walkin')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_session on billing_records(session_id);
create index if not exists idx_billing_room on billing_records(room_number);

-- =============================================================
-- ROW LEVEL SECURITY (permissive for now)
-- =============================================================

alter table sessions enable row level security;
alter table clients enable row level security;
alter table check_ins enable row level security;
alter table pdf_uploads enable row level security;
alter table billing_records enable row level security;

-- Allow all operations for authenticated and anonymous users (tighten later)
create policy "Allow all on sessions" on sessions for all using (true) with check (true);
create policy "Allow all on clients" on clients for all using (true) with check (true);
create policy "Allow all on check_ins" on check_ins for all using (true) with check (true);
create policy "Allow all on pdf_uploads" on pdf_uploads for all using (true) with check (true);
create policy "Allow all on billing_records" on billing_records for all using (true) with check (true);
