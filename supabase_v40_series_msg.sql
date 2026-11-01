-- =====================================================================
--  v40: Approval message and Telegram channel per TEST SERIES.
--
--  What it does
--  • When a payment is approved, the admin panel makes the message for the student. Until now every series got the
--    same text and the same Telegram channel (TG_CHANNEL in config.js), so Biology students got the Chemistry link.
--  • Now each series can have its own message and its own Telegram channel link (Admin → Test studio → a series →
--    "Approval message"). A series without its own message uses the default message, which can be edited too.
--  • Only the text is kept here; the panel fills in name, mobile, access code … when it makes the message.
--
--  Run in Supabase → SQL Editor after v39. Safe to run again.
--  THEN run supabase_v35_admin_team.sql AGAIN (it gives the new cbt_admin_series_msg function its permission check:
--  every team member who can approve can read the messages; changing them needs full access to Tests & content).
-- =====================================================================

-- k = 'default' or a series id. body '' = the built-in message. tg '' = the default Telegram link.
create table if not exists cbt_private.approve_msgs (
  k          text primary key,
  body       text not null default '',
  tg         text not null default '',
  updated_at timestamptz not null default now()
);
alter table cbt_private.approve_msgs enable row level security;
revoke all on cbt_private.approve_msgs from public, anon, authenticated;

-- actions: get | set | reset
create or replace function public.cbt_admin_series_msg(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb);
  v_k text := btrim(coalesce(d->>'id', ''));
  v_body text := coalesce(d->>'body', '');
  v_tg text := btrim(coalesce(d->>'tg', ''));
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    -- rows of deleted series are dropped now and then
    if random() < 0.05 then
      delete from approve_msgs m where m.k <> 'default' and not exists (select 1 from series sr where sr.id::text = m.k);
    end if;
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_object_agg(k, jsonb_build_object('body', body, 'tg', tg,
      'at', (extract(epoch from updated_at) * 1000)::bigint)) from approve_msgs), '{}'::jsonb));
  end if;

  if v_k <> 'default' and not exists (select 1 from series sr where sr.id::text = v_k) then
    return jsonb_build_object('ok', false, 'error', 'series');
  end if;

  if p_action = 'set' then
    if length(v_body) > 3000 then return jsonb_build_object('ok', false, 'error', 'body'); end if;
    if v_tg <> '' and (v_tg !~ '^https://t\.me/[A-Za-z0-9_+/=-]+$' or length(v_tg) > 200) then
      return jsonb_build_object('ok', false, 'error', 'tg');
    end if;
    insert into approve_msgs (k, body, tg) values (v_k, v_body, v_tg)
    on conflict (k) do update set body = excluded.body, tg = excluded.tg, updated_at = now();
    return jsonb_build_object('ok', true);

  elsif p_action = 'reset' then
    delete from approve_msgs where k = v_k;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_series_msg(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
