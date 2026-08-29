-- =============================================================================
-- Check-in PWA — Supabase schema
--
-- TENANT ISOLATION IS THE POINT OF THIS FILE.
--
-- The previous version of this schema enabled row level security and then
-- attached `using (true)` policies to every table. That combination reads like
-- security in a code review and provides none: it is functionally identical to
-- RLS being switched off. Because the client key is the *anon* key — which by
-- design ships to every browser — applying that version would have let any user
-- at any hotel read every guest row of every other hotel with a single fetch.
--
-- Rules for editing this file:
--   1. No policy may ever use `using (true)` or `with check (true)`.
--   2. Every table holding hotel or guest data carries `property_code not null`.
--   3. Every write policy carries a `with check` clause. `using` alone controls
--      what a caller can SEE; only `with check` controls what it can WRITE.
--      Without it a tenant can stamp a row with another tenant's property_code.
--   4. RLS is FORCED, so the table owner does not bypass its own policies.
--   5. `anon` gets nothing.
--
-- `src/__tests__/rls-policy-static.test.ts` enforces 1-5 on every commit, and
-- `src/__tests__/rls-isolation.test.ts` proves them against a live Postgres.
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- The tenant claim
--
-- Supabase puts the verified JWT payload in the `request.jwt.claims` GUC, so
-- reading it here works identically on Supabase and on a plain Postgres used
-- for testing. Deliberately NOT `security definer`: a definer function is
-- exactly how a carefully-policied schema grows a bypass.
--
-- `''` (rather than null) on a missing claim matters: null is not equal to
-- anything, so a null-returning helper makes every policy silently true-less
-- but also masks the difference between "no claim" and "claim not matched".
-- An empty string can never equal a real property_code, so an unauthenticated
-- caller sees exactly zero rows.
-- -----------------------------------------------------------------------------
create or replace function current_property_code() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'property_code',
    ''
  );
$$;

-- =============================================================================
-- SESSIONS
-- =============================================================================
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  date text not null,
  status text not null default 'active' check (status in ('active', 'closed')),
  property_code text not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- =============================================================================
-- CLIENTS
--
-- property_code is denormalised onto every child table rather than reached
-- through a join to sessions. A join-based policy is correct but slower, and it
-- fails open in the one case that matters — an orphaned row. The stamping
-- trigger below keeps it honest.
-- =============================================================================
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  property_code text not null,
  room_number text not null,
  name text not null,
  adults int not null default 0,
  children int not null default 0,
  rate_code text not null default '',
  package_code text not null default '',
  arrival_date text not null default '',
  departure_date text not null default '',
  is_vip boolean not null default false,
  vip_level text not null default '',
  vip_notes text not null default '',
  breakfast_included boolean not null default true,
  payment_action text check (payment_action in ('points', 'room_charge', 'pay_onsite', 'pass')),
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_session on clients(session_id);
create index if not exists idx_clients_property on clients(property_code);
create index if not exists idx_clients_room on clients(property_code, room_number);

-- =============================================================================
-- CHECK-INS
-- =============================================================================
create table if not exists check_ins (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  property_code text not null,
  room_number text not null,
  client_name text not null,
  people_entered int not null default 1,
  via_box boolean not null default false,
  checked_in_by text,
  timestamp timestamptz not null default now()
);

create index if not exists idx_checkins_session on check_ins(session_id);
create index if not exists idx_checkins_property on check_ins(property_code);

-- =============================================================================
-- PDF UPLOADS
-- =============================================================================
create table if not exists pdf_uploads (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  property_code text not null,
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
create index if not exists idx_uploads_property on pdf_uploads(property_code);

-- =============================================================================
-- BILLING RECORDS
-- =============================================================================
create table if not exists billing_records (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  property_code text not null,
  room_number text not null,
  client_name text not null,
  action text not null check (action in ('points', 'room_charge', 'pay_onsite', 'pass', 'walkin')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_session on billing_records(session_id);
create index if not exists idx_billing_property on billing_records(property_code);

-- =============================================================================
-- ACCESS LOG  (Art. 5(2) accountability)
--
-- Deliberately append-only and deliberately NOT cascade-deleted with the guest
-- data it describes: the record of who looked at a guest must outlive the
-- guest record, or the retention purge destroys the evidence along with the
-- data. `subject_ref` is a salted hash, never a name — an access log full of
-- guest names would be a second copy of the very thing it audits.
-- =============================================================================
create table if not exists access_log (
  id uuid primary key default uuid_generate_v4(),
  property_code text not null,
  actor text not null,
  action text not null,
  resource text not null,
  subject_ref text not null default '',
  room_number text not null default '',
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);

create index if not exists idx_access_property_at on access_log(property_code, at desc);
create index if not exists idx_access_subject on access_log(property_code, subject_ref);

-- =============================================================================
-- PURGE LOG  (evidence that retention actually runs)
-- =============================================================================
create table if not exists purge_log (
  id uuid primary key default uuid_generate_v4(),
  property_code text not null,
  ran_at timestamptz not null default now(),
  retention_days int not null,
  store text not null,
  records_removed int not null default 0,
  oldest_removed text not null default '',
  newest_removed text not null default '',
  trigger_source text not null default 'auto'
);

create index if not exists idx_purge_property_at on purge_log(property_code, ran_at desc);

-- =============================================================================
-- Stamp property_code on child rows from the parent session.
--
-- Defence in depth: the `with check` policies below already reject a row
-- carrying someone else's code. This makes the correct value the default so
-- application code cannot get it wrong in the first place, and so a row can
-- never be orphaned from its tenant.
-- =============================================================================
create or replace function stamp_property_code() returns trigger
language plpgsql
as $$
declare
  parent_code text;
begin
  select s.property_code into parent_code from sessions s where s.id = new.session_id;
  if parent_code is null then
    raise exception 'session % not found — cannot derive property_code', new.session_id;
  end if;
  -- Always authoritative: a caller-supplied value is overwritten, not trusted.
  new.property_code := parent_code;
  return new;
end;
$$;

drop trigger if exists trg_clients_stamp on clients;
create trigger trg_clients_stamp before insert or update on clients
  for each row execute function stamp_property_code();

drop trigger if exists trg_checkins_stamp on check_ins;
create trigger trg_checkins_stamp before insert or update on check_ins
  for each row execute function stamp_property_code();

drop trigger if exists trg_uploads_stamp on pdf_uploads;
create trigger trg_uploads_stamp before insert or update on pdf_uploads
  for each row execute function stamp_property_code();

drop trigger if exists trg_billing_stamp on billing_records;
create trigger trg_billing_stamp before insert or update on billing_records
  for each row execute function stamp_property_code();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table sessions        enable row level security;
alter table clients         enable row level security;
alter table check_ins       enable row level security;
alter table pdf_uploads     enable row level security;
alter table billing_records enable row level security;
alter table access_log      enable row level security;
alter table purge_log       enable row level security;

-- FORCE, so the table owner is subject to its own policies. Without this, any
-- pooled connection running as the owner reads every tenant.
alter table sessions        force row level security;
alter table clients         force row level security;
alter table check_ins       force row level security;
alter table pdf_uploads     force row level security;
alter table billing_records force row level security;
alter table access_log      force row level security;
alter table purge_log       force row level security;

-- Per-verb policies. Split rather than `for all` so that append-only tables can
-- withhold update and delete entirely.

create policy sessions_select on sessions for select
  using (property_code = current_property_code());
create policy sessions_insert on sessions for insert
  with check (property_code = current_property_code());
create policy sessions_update on sessions for update
  using (property_code = current_property_code())
  with check (property_code = current_property_code());
create policy sessions_delete on sessions for delete
  using (property_code = current_property_code());

create policy clients_select on clients for select
  using (property_code = current_property_code());
create policy clients_insert on clients for insert
  with check (property_code = current_property_code());
create policy clients_update on clients for update
  using (property_code = current_property_code())
  with check (property_code = current_property_code());
create policy clients_delete on clients for delete
  using (property_code = current_property_code());

create policy check_ins_select on check_ins for select
  using (property_code = current_property_code());
create policy check_ins_insert on check_ins for insert
  with check (property_code = current_property_code());
create policy check_ins_update on check_ins for update
  using (property_code = current_property_code())
  with check (property_code = current_property_code());
create policy check_ins_delete on check_ins for delete
  using (property_code = current_property_code());

create policy pdf_uploads_select on pdf_uploads for select
  using (property_code = current_property_code());
create policy pdf_uploads_insert on pdf_uploads for insert
  with check (property_code = current_property_code());
create policy pdf_uploads_update on pdf_uploads for update
  using (property_code = current_property_code())
  with check (property_code = current_property_code());
create policy pdf_uploads_delete on pdf_uploads for delete
  using (property_code = current_property_code());

create policy billing_records_select on billing_records for select
  using (property_code = current_property_code());
create policy billing_records_insert on billing_records for insert
  with check (property_code = current_property_code());
create policy billing_records_update on billing_records for update
  using (property_code = current_property_code())
  with check (property_code = current_property_code());
create policy billing_records_delete on billing_records for delete
  using (property_code = current_property_code());

-- Append-only: a tenant may write and read its own audit trail, and may never
-- edit or erase it. An access log a caller can rewrite is not an access log.
create policy access_log_select on access_log for select
  using (property_code = current_property_code());
create policy access_log_insert on access_log for insert
  with check (property_code = current_property_code());

create policy purge_log_select on purge_log for select
  using (property_code = current_property_code());
create policy purge_log_insert on purge_log for insert
  with check (property_code = current_property_code());

-- =============================================================================
-- GRANTS
--
-- `anon` holds the key that ships inside the JavaScript bundle. It gets nothing.
-- Reaching this data requires an authenticated session carrying a property_code.
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on
  sessions, clients, check_ins, pdf_uploads, billing_records
  to authenticated;
grant select, insert on access_log, purge_log to authenticated;
grant execute on function current_property_code() to authenticated;

-- =============================================================================
-- VIEWS
--
-- security_invoker means a view runs with the querying user's permissions, so
-- the underlying policies still apply. Without it a view is a clean bypass of
-- every policy above — the classic hole left behind after the tables look right.
-- =============================================================================
create or replace view daily_totals
  with (security_invoker = on)
as
  select
    c.property_code,
    s.date,
    count(*)                                   as rooms,
    sum(c.adults + c.children)                 as guests,
    count(*) filter (where c.is_vip)           as vips
  from clients c
  join sessions s on s.id = c.session_id
  group by c.property_code, s.date;

grant select on daily_totals to authenticated;

-- =============================================================================
-- AI SPEND LEDGER
--
-- Backs src/lib/security/budget.ts. One row per (scope, period), where scope is
-- 'global' or 'property:<code>' and period is a UTC month key like '2026-08'.
--
-- This table carries NO guest or hotel personal data — only a running cost
-- total — so it is not a tenant table and gets no property_code column.
--
-- It also gets NO POLICY, deliberately. RLS is forced and nothing is granted to
-- anon or authenticated, so the only way in is the service-role key held by the
-- server. A policy here would have to be scoped by current_property_code(),
-- which the API routes do not run under: they meter spend before any user
-- claim exists. Server-only is the correct blast radius for a spend counter.
-- =============================================================================
create table if not exists ai_spend (
  scope      text           not null,
  period     text           not null,
  total_usd  numeric(12, 6) not null default 0,
  updated_at timestamptz    not null default now(),
  primary key (scope, period)
);

alter table ai_spend enable row level security;
alter table ai_spend force row level security;

-- Atomic add-and-return. Doing this in SQL is what makes the cap hold when
-- several serverless instances reserve budget in the same moment; read-then-
-- write from the application would let them all see room and overshoot.
create or replace function ai_spend_add(
  p_scope text,
  p_period text,
  p_delta numeric
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
begin
  insert into ai_spend (scope, period, total_usd, updated_at)
  values (p_scope, p_period, p_delta, now())
  on conflict (scope, period) do update
    set total_usd  = ai_spend.total_usd + excluded.total_usd,
        updated_at = now()
  returning total_usd into v_total;

  return v_total;
end;
$$;

revoke all on table ai_spend from anon, authenticated;
revoke all on function ai_spend_add(text, text, numeric) from anon, authenticated;
