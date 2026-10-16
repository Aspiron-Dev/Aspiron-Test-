-- =====================================================================
--  v10: Push notifications (reach students even when the app is closed)
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again.
-- =====================================================================

create table if not exists public.cbt_push_subs (
  endpoint    text primary key,
  mobile      text        not null,
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz not null default now()
);
create index if not exists cbt_push_subs_mobile on public.cbt_push_subs (mobile);
alter table public.cbt_push_subs enable row level security;   -- no policies: only functions can read/write
revoke all on public.cbt_push_subs from anon, authenticated;

-- Student's phone saves (or removes) its push subscription.
-- Login is checked with the existing cbt_notice() call, so only signed-in students can register.
create or replace function public.cbt_push_save(p_mobile text, p_code text, p_device text, p_sub jsonb default null, p_on boolean default true)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare a jsonb; v_ep text;
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_ep := left(coalesce(p_sub->>'endpoint', ''), 1000);
  if v_ep !~ '^https://' then return jsonb_build_object('ok', false, 'error', 'sub'); end if;
  if not p_on then
    delete from public.cbt_push_subs where endpoint = v_ep;
    return jsonb_build_object('ok', true);
  end if;
  if coalesce(p_sub#>>'{keys,p256dh}', '') = '' or coalesce(p_sub#>>'{keys,auth}', '') = '' then
    return jsonb_build_object('ok', false, 'error', 'sub');
  end if;
  insert into public.cbt_push_subs (endpoint, mobile, p256dh, auth)
  values (v_ep, p_mobile, left(p_sub#>>'{keys,p256dh}', 200), left(p_sub#>>'{keys,auth}', 100))
  on conflict (endpoint) do update set mobile = excluded.mobile, p256dh = excluded.p256dh, auth = excluded.auth, seen_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function public.cbt_push_save(text, text, text, jsonb, boolean) to anon, authenticated;

-- Admin: how many phones are registered (shown in the admin panel)
create or replace function public.cbt_admin_push_count(p_pw text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare a jsonb;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'phones', (select count(*) from public.cbt_push_subs), 'students', (select count(distinct mobile) from public.cbt_push_subs));
end;
$$;
grant execute on function public.cbt_admin_push_count(text) to anon, authenticated;

notify pgrst, 'reload schema';
