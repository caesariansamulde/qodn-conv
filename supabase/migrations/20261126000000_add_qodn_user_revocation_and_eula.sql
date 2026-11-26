-- Add per-user revocation controls and EULA acceptance tracking to qodn_profiles

alter table public.qodn_profiles
  add column if not exists is_revoked boolean not null default false,
  add column if not exists revoke_reason text,
  add column if not exists eula_accepted_at timestamptz,
  add column if not exists eula_version text;

create or replace function public.qodn_protect_revocation_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt()->'app_metadata'->>'role'), '') <> 'admin' then
    new.is_revoked := old.is_revoked;
    new.revoke_reason := old.revoke_reason;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_qodn_profiles_protect_revocation on public.qodn_profiles;
create trigger trg_qodn_profiles_protect_revocation
  before update on public.qodn_profiles
  for each row
  execute function public.qodn_protect_revocation_fields();

drop policy if exists "qodn_profiles_update_admin" on public.qodn_profiles;
create policy "qodn_profiles_update_admin"
  on public.qodn_profiles for update
  to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin')
  with check (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin');
