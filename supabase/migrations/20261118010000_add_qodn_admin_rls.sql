-- Grant admin role in app_metadata for primary owner and add admin SELECT policies
-- Note: app_metadata is server/admin-only (cannot be modified by end users).

update auth.users
set raw_app_meta_data = jsonb_set(
  coalesce(raw_app_meta_data, '{}'::jsonb),
  '{role}',
  '"admin"'
)
where lower(email) = 'caesarsamulde@gmail.com';

drop policy if exists "qodn_profiles_select_admin" on public.qodn_profiles;
create policy "qodn_profiles_select_admin"
  on public.qodn_profiles for select
  to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin');

drop policy if exists "qodn_history_select_admin" on public.qodn_conversion_history;
create policy "qodn_history_select_admin"
  on public.qodn_conversion_history for select
  to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin');

drop policy if exists "qodn_usage_select_admin" on public.qodn_usage_logs;
create policy "qodn_usage_select_admin"
  on public.qodn_usage_logs for select
  to authenticated
  using (coalesce((select auth.jwt()->'app_metadata'->>'role'), '') = 'admin');
