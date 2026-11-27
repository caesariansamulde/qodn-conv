-- Add admin approval gate and anti-sharing device limit to qodn_profiles

alter table public.qodn_profiles
  add column if not exists is_approved boolean not null default false,
  add column if not exists max_devices integer not null default 2,
  add column if not exists registered_devices text[] not null default '{}'::text[];

-- Existing users & owner remain approved
update public.qodn_profiles
set is_approved = true
where is_approved = false;

update public.qodn_profiles
set max_devices = 10
where lower(email) = 'caesarsamulde@gmail.com';

-- Protect admin-only columns (approval, revocation, device limits) from self-modification
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
    new.is_approved := old.is_approved;
    new.max_devices := old.max_devices;
    new.registered_devices := old.registered_devices;
  end if;
  return new;
end;
$$;

-- Server-enforced device registration RPC (checks auth.uid(), enforces max_devices)
create or replace function public.qodn_register_device(p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_devices text[];
  v_max integer;
  v_clean text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return jsonb_build_object('allowed', false, 'reason', 'Not authenticated');
  end if;

  v_clean := trim(coalesce(p_fingerprint, ''));
  if v_clean = '' then
    return jsonb_build_object('allowed', true, 'device_count', 0, 'max_devices', 2);
  end if;

  select registered_devices, max_devices
  into v_devices, v_max
  from public.qodn_profiles
  where id = v_uid
  for update;

  if not found then
    return jsonb_build_object('allowed', true, 'device_count', 0, 'max_devices', 2);
  end if;

  v_devices := coalesce(v_devices, '{}'::text[]);
  v_max := coalesce(v_max, 2);

  if v_clean = any(v_devices) then
    return jsonb_build_object(
      'allowed', true,
      'device_count', coalesce(array_length(v_devices, 1), 0),
      'max_devices', v_max
    );
  end if;

  if coalesce(array_length(v_devices, 1), 0) >= v_max then
    return jsonb_build_object(
      'allowed', false,
      'device_count', coalesce(array_length(v_devices, 1), 0),
      'max_devices', v_max,
      'reason', format('Device limit reached (%s/%s authorized devices). Contact Caesar Ian Samulde to authorize this PC.', coalesce(array_length(v_devices, 1), 0), v_max)
    );
  end if;

  update public.qodn_profiles
  set registered_devices = array_append(v_devices, v_clean)
  where id = v_uid;

  return jsonb_build_object(
    'allowed', true,
    'device_count', coalesce(array_length(v_devices, 1), 0) + 1,
    'max_devices', v_max
  );
end;
$$;

revoke all on function public.qodn_register_device(text) from public;
grant execute on function public.qodn_register_device(text) to authenticated;
