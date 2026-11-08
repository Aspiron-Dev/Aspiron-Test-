-- =====================================================================
--  v62: Admin panel security — detailed security alerts, block an address, team sign-in switch
--  • Every security event now keeps the full IP address and the device (browser) for 30 days, and the username
--    that was tried on the team sign-in. Admin → Team & access → Security alerts shows them in three groups
--    (Risky sign-ins · Admin changes · Students), each event opens with its details, the addresses with the most
--    events are listed, and an address can be BLOCKED (no admin or team sign-in from it).
--  • A sign-in of the owner from a new place now shows on the bell.
--  • In supabase_v35_admin_team.sql (run it again after this file): team sign-in switch (off by default),
--    blocked addresses refused, owner: 5 wrong passwords from one place lock it for 1 hour (was 10 → 15 minutes).
--  Run after v61, then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================

alter table cbt_private.security_events add column if not exists ip_full text not null default '';
alter table cbt_private.security_events add column if not exists ua text not null default '';
create index if not exists security_events_ipf on cbt_private.security_events (ip_full, at desc) where ip_full <> '';
create table if not exists cbt_private.admin_ip_blocks (ip text primary key, note text not null default '', who text not null default '',
  at timestamptz not null default now());
revoke all on cbt_private.admin_ip_blocks from public, anon, authenticated;
alter table cbt_private.admin_ip_blocks enable row level security;
insert into cbt_private.settings (key, value) values ('team_login', 'off') on conflict (key) do nothing;

-- which group an event belongs to: 'risk' (sign-in attacks, 2FA, new places) · 'admin' (changes made in the panel) · 'students'
create or replace function cbt_private.sec_cat(p_kind text) returns text language sql immutable set search_path = pg_temp as $$
  select case when p_kind in ('student_locked', 'busy', 'many:student_locked', 'many:busy') then 'students'
              when p_kind in ('team_changed', 'owner_password_changed', 'member_access_or_money') then 'admin'
              else 'risk' end
$$;

create or replace function cbt_private.sec_event(p_kind text, p_level text, p_who text default '', p_detail text default '')
returns void language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare n int; lim int := sec_limit(p_kind); v_ip text := ''; v_full text := ''; v_ua text := '';
begin
  begin
    v_ip := coalesce(adm_ip(), ''); v_full := coalesce(adm_raw_ip(), ''); v_ua := coalesce(adm_hd()->>'user-agent', '');
  exception when others then null; end;
  insert into security_events (kind, level, who, detail, ip, ip_full, ua)
  values (left(p_kind, 40), p_level, left(coalesce(p_who, ''), 80), left(coalesce(p_detail, ''), 160), left(v_ip, 40),
          left(regexp_replace(v_full, '[^0-9a-fA-F:.]', '', 'g'), 45), left(regexp_replace(v_ua, '[<>"`\r\n\t]', '', 'g'), 200));
  if p_level = 'low' and lim > 0 then
    select count(*) into n from security_events where kind = p_kind and level = 'low' and at > now() - interval '1 hour';
    if n = lim and not exists (select 1 from security_events where kind = 'many:' || p_kind and at > now() - interval '1 hour') then
      insert into security_events (kind, level, detail, ip, ip_full, ua)
      values ('many:' || p_kind, 'high', n || ' in the last hour', left(v_ip, 40), left(regexp_replace(v_full, '[^0-9a-fA-F:.]', '', 'g'), 45), '');
    end if;
  end if;
  if random() < 0.01 then delete from security_events where at < now() - interval '180 days'; end if;
exception when others then
  null;   -- an alert must never break a sign-in or a test
end $$;
revoke all on function cbt_private.sec_event(text, text, text, text), cbt_private.sec_cat(text) from public, anon, authenticated;

-- wrong team password: with the username that was tried
create or replace function cbt_private.sec_t_fail_team() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_u text := nullif(current_setting('cbt.try_user', true), '');
begin
  perform sec_event('team_wrong_password', 'low', 'Team sign-in' || coalesce(' · tried "' || v_u || '"', ''),
                    case when coalesce((select value from settings where key = 'team_login'), 'on') = 'off' then 'Team sign-in is switched off' else '' end);
  return null;
end $$;
revoke all on function cbt_private.sec_t_fail_team() from public, anon, authenticated;

-- a sign-in of the owner from a new place → bell (warn)
create or replace function cbt_private.sec_t_audit() returns trigger
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare k text := new.fn || ':' || new.act;
begin
  if new.result = 'refused' then
    perform sec_event('refused', 'low', new.who, k);
  elsif new.result = '' then
    if k in ('cbt_admin_team:user_save', 'cbt_admin_team:user_delete', 'cbt_admin_team:team_2fa', 'cbt_admin_team:team_login',
             'cbt_admin_security:block', 'cbt_admin_security:unblock') then
      perform sec_event('team_changed', 'high', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    elsif k in ('cbt_admin_team:owner_password', 'cbt_admin:set_password') then
      perform sec_event('owner_password_changed', 'high', new.who, 'The owner password was changed');
    elsif k = 'session:sign_in' then
      if new.detail like '%recovery code used%' then
        perform sec_event('recovery_code_used', 'high', new.who, 'Signed in with a recovery code');
      end if;
      if new.ip <> '' and not exists (select 1 from admin_audit a where a.fn = 'session' and a.act = 'sign_in' and a.id <> new.id
                                         and a.uid is not distinct from new.uid and a.ip = new.ip and a.at > now() - interval '90 days') then
        perform sec_event('new_place_sign_in', case when new.uid is null then 'warn' else 'info' end, new.who, left(new.detail, 80));   -- v62: the owner → bell
      end if;
    elsif new.uid is not null and (k in ('cbt_admin:grant', 'cbt_admin_store:order_status', 'cbt_admin_store_order:approve',
                                          'cbt_admin_payments:add', 'cbt_admin_payments:update', 'cbt_admin_payments:delete',
                                          'cbt_admin_edit:order_delete', 'cbt_admin:student_delete',
                                          -- v53: wallet money, referral reward and coupons changed by a member
                                          'cbt_admin_refer:adjust', 'cbt_admin_refer:settings', 'cbt_admin_coupons:set',
                                          'cbt_admin_coupons:bulk', 'cbt_admin_coupons:switch')) then
      perform sec_event('member_access_or_money', 'warn', new.who, k || case when new.detail <> '' then ' · ' || new.detail else '' end);
    end if;
  end if;
  return null;
end $$;

revoke all on function public.cbt_refer_order(text, text, text), public.cbt_refer_wallet(text, text, text), public.cbt_admin_refer_min(text, text, jsonb),
  public.cbt_store_order_apply(text, text, text, boolean, text, text), public.cbt_refer_me(text, text), public.cbt_refer_join(text, text, text) from public, authenticated;

create or replace function cbt_private.ip_purge() returns void
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
begin
  update public.cbt_store_orders set ip = '' where ip <> '' and created_at < now() - interval '30 days';
  if to_regclass('public.cbt_store_notify') is not null then
    update public.cbt_store_notify set ip = '' where ip <> '' and created_at < now() - interval '30 days';
  end if;
  delete from access_requests where created_at < now() - interval '1 day';
  delete from public.cbt_store_tries where at < now() - interval '2 hours';
  delete from public.cbt_promo_clicks where at < now() - interval '2 hours';
  -- v62: full addresses and devices of security events are kept 30 days
  update security_events set ip_full = '', ua = '' where (ip_full <> '' or ua <> '') and at < now() - interval '30 days';
end $$;
revoke all on function cbt_private.ip_purge() from public, anon, authenticated;

-- ---------- admin: Team & access → Security alerts (owner only; checked again in v35) ----------
-- count → {unseen}   get {days, cat: 'risk'|'admin'|'students'|'all'} → events (with full IP, device), counts, top addresses,
-- blocked addresses, me (this connection's address)   seen   seen_one {id}   block {ip, note}   unblock {ip}
create or replace function public.cbt_admin_security(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_days int; v_cat text; v_ip text; v_me text := coalesce(adm_raw_ip(), '');
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_action = 'count' then
    return jsonb_build_object('ok', true, 'unseen', (select count(*) from security_events where level in ('high', 'warn') and not seen));
  elsif p_action = 'get' then
    v_days := greatest(1, least(90, coalesce(nullif(d->>'days', '')::int, 7)));
    v_cat := case when d->>'cat' in ('risk', 'admin', 'students') then d->>'cat' else 'all' end;
    return jsonb_build_object('ok', true, 'me', v_me,
      'unseen', (select count(*) from security_events where level in ('high', 'warn') and not seen),
      'cats', coalesce((select jsonb_object_agg(c, n) from (select sec_cat(kind) c, count(*) n from security_events
                         where at > now() - make_interval(days => v_days) group by 1) z), '{}'::jsonb),
      'counts', coalesce((select jsonb_object_agg(kind, n) from (select kind, count(*) n from security_events
                           where at > now() - make_interval(days => v_days) and (v_cat = 'all' or sec_cat(kind) = v_cat) group by kind) z), '{}'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'at', (extract(epoch from at) * 1000)::bigint, 'kind', kind,
                           'cat', sec_cat(kind), 'level', level, 'who', who, 'detail', detail, 'ip', ip, 'ip_full', ip_full, 'ua', ua, 'seen', seen,
                           'blocked', exists (select 1 from admin_ip_blocks b where b.ip = z.ip_full and z.ip_full <> '')) order by id desc)
                          from (select * from security_events where at > now() - make_interval(days => v_days)
                                  and (v_cat = 'all' or sec_cat(kind) = v_cat)
                                order by (level in ('high', 'warn') and not seen) desc, id desc limit 300) z), '[]'::jsonb),
      'ips', coalesce((select jsonb_agg(jsonb_build_object('ip', ip_full, 'n', n, 'kinds', kinds, 'first', (extract(epoch from f) * 1000)::bigint,
                         'last', (extract(epoch from l) * 1000)::bigint, 'me', ip_full = v_me,
                         'blocked', exists (select 1 from admin_ip_blocks b where b.ip = x.ip_full)) order by n desc)
                       from (select ip_full, count(*) n, min(at) f, max(at) l, array_agg(distinct kind) kinds from security_events
                              where ip_full <> '' and at > now() - make_interval(days => v_days) and sec_cat(kind) = 'risk'
                              group by ip_full order by count(*) desc limit 20) x), '[]'::jsonb),
      'blocks', coalesce((select jsonb_agg(jsonb_build_object('ip', ip, 'note', note, 'who', who, 'at', (extract(epoch from at) * 1000)::bigint) order by at desc)
                          from admin_ip_blocks), '[]'::jsonb));
  elsif p_action = 'seen' then
    update security_events set seen = true where not seen;
    return jsonb_build_object('ok', true);
  elsif p_action = 'seen_one' then
    update security_events set seen = true where id = nullif(d->>'id', '')::bigint;
    return jsonb_build_object('ok', true);
  elsif p_action in ('block', 'unblock') then
    v_ip := btrim(coalesce(d->>'ip', ''));
    if v_ip !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' and v_ip !~ '^[0-9a-fA-F:]{3,45}$' then return jsonb_build_object('ok', false, 'error', 'ip'); end if;
    perform set_config('cbt.detail', v_ip, true);
    if p_action = 'unblock' then
      delete from admin_ip_blocks where ip = v_ip;
      return jsonb_build_object('ok', true);
    end if;
    if v_ip = v_me then return jsonb_build_object('ok', false, 'error', 'own_ip'); end if;   -- never lock yourself out
    insert into admin_ip_blocks (ip, note, who) values (v_ip, left(btrim(regexp_replace(coalesce(d->>'note', ''), '[<>\r\t]', '', 'g')), 200), 'Owner')
      on conflict (ip) do update set note = excluded.note, at = now();
    -- sessions in use from that address stop too: the session check refuses a blocked address (v35)
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_security(text, text, jsonb) to anon;
revoke all on function public.cbt_admin_security(text, text, jsonb) from public, authenticated;

notify pgrst, 'reload schema';
select 'v62 installed — now run supabase_v35_admin_team.sql again' as status;
