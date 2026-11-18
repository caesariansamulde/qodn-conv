-- QuickODN Studio tables in shared Kasbel/Relay Supabase project (khhzklruvmeucvoqmzuf)
-- Run this once in Supabase Dashboard -> SQL Editor (or via `supabase db push`).

-- 1. User Profiles & Onboarding Info
create table if not exists public.qodn_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  first_name text,
  last_name text,
  company_name text,
  avatar_url text,
  profile_completed boolean not null default false,
  auth_provider text not null default 'google',
  last_sign_in_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists qodn_profiles_email_idx on public.qodn_profiles (email);

create or replace function public.qodn_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_qodn_profiles_updated_at on public.qodn_profiles;
create trigger trg_qodn_profiles_updated_at
  before update on public.qodn_profiles
  for each row
  execute function public.qodn_set_updated_at();

alter table public.qodn_profiles enable row level security;

drop policy if exists "qodn_profiles_select_own" on public.qodn_profiles;
create policy "qodn_profiles_select_own"
  on public.qodn_profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "qodn_profiles_insert_own" on public.qodn_profiles;
create policy "qodn_profiles_insert_own"
  on public.qodn_profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "qodn_profiles_update_own" on public.qodn_profiles;
create policy "qodn_profiles_update_own"
  on public.qodn_profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

grant select, insert, update on public.qodn_profiles to authenticated;
revoke all on public.qodn_profiles from anon;

-- 2. Conversion History
create table if not exists public.qodn_conversion_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  event text not null,
  mode text not null,
  provider text,
  file_name text not null,
  item_count integer not null default 0,
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists qodn_conversion_history_user_created_idx
  on public.qodn_conversion_history (user_id, created_at desc);

alter table public.qodn_conversion_history enable row level security;

drop policy if exists "qodn_history_select_own" on public.qodn_conversion_history;
create policy "qodn_history_select_own"
  on public.qodn_conversion_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "qodn_history_insert_own" on public.qodn_conversion_history;
create policy "qodn_history_insert_own"
  on public.qodn_conversion_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "qodn_history_delete_own" on public.qodn_conversion_history;
create policy "qodn_history_delete_own"
  on public.qodn_conversion_history for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.qodn_conversion_history to authenticated;
revoke all on public.qodn_conversion_history from anon;

-- 3. Usage & Telemetry Logs
create table if not exists public.qodn_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  action text not null,
  mode text,
  file_name text,
  entity_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qodn_usage_logs_user_created_idx
  on public.qodn_usage_logs (user_id, created_at desc);

alter table public.qodn_usage_logs enable row level security;

drop policy if exists "qodn_usage_select_own" on public.qodn_usage_logs;
create policy "qodn_usage_select_own"
  on public.qodn_usage_logs for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "qodn_usage_insert_own" on public.qodn_usage_logs;
create policy "qodn_usage_insert_own"
  on public.qodn_usage_logs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.qodn_usage_logs to authenticated;
revoke all on public.qodn_usage_logs from anon;
