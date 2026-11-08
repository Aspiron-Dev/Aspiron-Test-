-- =====================================================================
--  v63: Security alerts on Telegram, at once
--  Serious security events (many wrong passwords, a blocked address, 2FA turned off, a recovery code, a sign-in of the
--  owner from a new place, team changes, members giving access / changing money, the first sign-in try without the
--  admin key from an address each day) are sent to the owner's Telegram the moment they happen.
--  Free: the database itself sends the message (pg_net) to api.telegram.org; no GitHub minutes, no paid service.
--  Set up in Admin → Team & access → Security alerts → "Alerts on Telegram" (bot token from @BotFather, then Start).
--  The token is kept only in cbt_private.settings (nobody can read it from the website) and never shown again.
--  Turn off there, or SQL Editor: delete from cbt_private.settings where key in ('tg_token','tg_chat','tg_req');
--  Run after v62, then supabase_v35_admin_team.sql again. Safe to run again.
-- =====================================================================
create extension if not exists pg_net with schema extensions;

create table if not exists cbt_private.tg_sent (at timestamptz not null default now());
revoke all on cbt_private.tg_sent from public, anon, authenticated;
alter table cbt_private.tg_sent enable row level security;

-- send one message to the owner's Telegram (at most 30 an hour, so a flood cannot spam the phone); true = queued
create or replace function cbt_private.tg_send(p_text text) returns boolean
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v_tok text := (select value from settings where key = 'tg_token');
        v_chat text := (select value from settings where key = 'tg_chat');
begin
  if coalesce(v_tok, '') = '' or coalesce(v_chat, '') = '' then return false; end if;
  if (select count(*) from tg_sent where at > now() - interval '1 hour') >= 30 then return false; end if;
  insert into tg_sent default values;
  if random() < 0.05 then delete from tg_sent where at < now() - interval '2 hours'; end if;
  perform net.http_post(url := 'https://api.telegram.org/bot' || v_tok || '/sendMessage',
                        body := jsonb_build_object('chat_id', v_chat, 'text', left(coalesce(p_text, ''), 3500), 'disable_web_page_preview', true),
                        headers := '{"Content-Type": "application/json"}'::jsonb);
  return true;
exception when others then
  return false;   -- an alert must never break a sign-in
end $$;

-- which events go to Telegram, and the message
create or replace function cbt_private.tg_alert(p_kind text, p_level text, p_who text, p_detail text, p_ip text) returns void
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare k text := regexp_replace(coalesce(p_kind, ''), '^many:', ''); v_name text;
begin
  if coalesce((select value from settings where key = 'tg_chat'), '') = '' then return; end if;
  if not (p_level in ('high', 'warn')
          or (p_kind = 'no_key_login' and coalesce(p_ip, '') <> ''
              and (select count(*) from security_events where kind = 'no_key_login' and ip_full = p_ip and at > now() - interval '24 hours') <= 1)) then
    return;
  end if;
  v_name := case k
    when 'owner_wrong_password' then 'Wrong owner passwords' when 'team_wrong_password' then 'Wrong team passwords'
    when 'wrong_2fa' then 'Wrong two-step codes (the password was right!)' when 'sign_in_locked' then 'Sign-in locked (too many wrong tries)'
    when 'sign_in_paused' then 'Sign-in paused (100 wrong passwords in an hour)' when '2fa_locked' then 'Two-step code locked'
    when '2fa_off' then 'Two-step sign-in turned OFF' when 'recovery_code_used' then 'Recovery code used to sign in'
    when 'new_place_sign_in' then 'Owner signed in from a new place' when 'team_changed' then 'Team / admin setting changed'
    when 'owner_password_changed' then 'Owner password changed' when 'member_access_or_money' then 'Team member gave access / changed money'
    when 'ip_auto_blocked' then 'Address blocked automatically (15 wrong passwords)' when 'no_key_login' then 'Sign-in tried WITHOUT the admin key (refused)'
    when 'refused' then 'Team member refused (no permission)' when 'student_locked' then 'Students locked out (wrong codes)'
    when 'busy' then 'Students sending too many requests' else k end;
  perform tg_send(case when p_level = 'high' then '🚨' else '⚠️' end || ' Aspiron admin alert' || E'\n'
    || case when p_kind like 'many:%' then 'Many: ' else '' end || v_name
    || case when coalesce(p_who, '') <> '' then E'\nWho: ' || p_who else '' end
    || case when coalesce(p_detail, '') <> '' then E'\n' || p_detail else '' end
    || case when coalesce(p_ip, '') <> '' then E'\nIP: ' || p_ip else '' end
    || E'\nTime: ' || to_char(now() at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM')
    || E'\nCheck: Admin → Team & access → Security alerts');
exception when others then null;
end $$;
revoke all on function cbt_private.tg_send(text), cbt_private.tg_alert(text, text, text, text, text) from public, anon, authenticated;

-- ---------- every security event (from v62) + Telegram ----------
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
  perform tg_alert(p_kind, p_level, p_who, p_detail, v_full);   -- v63: Telegram, at once
  if p_level = 'low' and lim > 0 then
    select count(*) into n from security_events where kind = p_kind and level = 'low' and at > now() - interval '1 hour';
    if n = lim and not exists (select 1 from security_events where kind = 'many:' || p_kind and at > now() - interval '1 hour') then
      insert into security_events (kind, level, detail, ip, ip_full, ua)
      values ('many:' || p_kind, 'high', n || ' in the last hour', left(v_ip, 40), left(regexp_replace(v_full, '[^0-9a-fA-F:.]', '', 'g'), 45), '');
      perform tg_alert('many:' || p_kind, 'high', '', n || ' in the last hour', v_full);
    end if;
  end if;
  if random() < 0.01 then delete from security_events where at < now() - interval '180 days'; end if;
exception when others then
  null;   -- an alert must never break a sign-in or a test
end $$;
revoke all on function cbt_private.sec_event(text, text, text, text), cbt_private.sec_cat(text) from public, anon, authenticated;

-- ---------- admin (owner only; checked again in v35): Team & access → Security alerts → Alerts on Telegram ----------
--  status → {set, linked, waiting}   set {token} (then the owner presses Start in the bot)   test   off
create or replace function public.cbt_admin_telegram(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_tok text; v_req bigint; v_c text; v_chat text;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  v_tok := (select value from settings where key = 'tg_token');
  if p_action = 'set' then
    v_tok := btrim(coalesce(d->>'token', ''));
    if v_tok !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,60}$' then return jsonb_build_object('ok', false, 'error', 'token'); end if;
    insert into settings values ('tg_token', v_tok) on conflict (key) do update set value = excluded.value;
    delete from settings where key in ('tg_chat', 'tg_req');
    v_req := net.http_get(url := 'https://api.telegram.org/bot' || v_tok || '/getUpdates');
    insert into settings values ('tg_req', v_req::text) on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true, 'set', true, 'linked', false, 'waiting', true);
  elsif p_action = 'status' then
    if coalesce(v_tok, '') = '' then return jsonb_build_object('ok', true, 'set', false, 'linked', false); end if;
    if coalesce((select value from settings where key = 'tg_chat'), '') <> '' then return jsonb_build_object('ok', true, 'set', true, 'linked', true); end if;
    -- not linked yet: read the bot's latest message (the owner pressed Start), then ask Telegram again for the next check
    v_req := nullif((select value from settings where key = 'tg_req'), '')::bigint;
    if v_req is not null then
      select content into v_c from net._http_response where id = v_req;
      begin
        select m->'message'->'chat'->>'id' into v_chat
          from jsonb_array_elements(coalesce(v_c::jsonb->'result', '[]'::jsonb)) with ordinality x(m, n)
         where m->'message'->'chat'->>'type' = 'private' order by n desc limit 1;
      exception when others then v_chat := null; end;
    end if;
    if v_chat ~ '^-?[0-9]{3,20}$' then
      insert into settings values ('tg_chat', v_chat) on conflict (key) do update set value = excluded.value;
      delete from settings where key = 'tg_req';
      perform tg_send('✅ Aspiron admin alerts are ON. Serious security alerts will come here at once.');
      return jsonb_build_object('ok', true, 'set', true, 'linked', true);
    end if;
    v_req := net.http_get(url := 'https://api.telegram.org/bot' || v_tok || '/getUpdates');
    insert into settings values ('tg_req', v_req::text) on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true, 'set', true, 'linked', false, 'waiting', true);
  elsif p_action = 'test' then
    return jsonb_build_object('ok', tg_send('🔔 Test alert from the Aspiron admin panel. Alerts are working.'));
  elsif p_action = 'off' then
    delete from settings where key in ('tg_token', 'tg_chat', 'tg_req');
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_telegram(text, text, jsonb) to anon;
revoke all on function public.cbt_admin_telegram(text, text, jsonb) from public, authenticated;

notify pgrst, 'reload schema';
select 'v63 installed — now run supabase_v35_admin_team.sql again' as status;
