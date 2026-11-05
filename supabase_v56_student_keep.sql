-- =====================================================================
--  v56: the student's profile details and exam countdown are kept on the account
--
--  • Until now the profile (photo, alternate phone, school, city, class, exam, about) and the exam countdown were kept
--    only inside one browser. Clearing the browser's site data, a full phone storage, another browser or another phone
--    meant they were gone ("my profile disappeared"). Name, email and mobile number were already on the account (v44).
--  • cbt_keep saves them on the student's own account and gives them back after sign-in, on any phone or browser.
--  • Only the signed-in student reads or writes their own copy. Every value is checked and cut to size here, the photo
--    must be a small data:image, nothing else is stored. Read / write only; nothing about tests, payments or access.
--  • Before this file is run the app works as before (details stay on the phone only).
--
--  Run in Supabase → SQL Editor. Safe to run again.
-- =====================================================================

alter table cbt_private.students add column if not exists keep jsonb not null default '{}'::jsonb;

create or replace function public.cbt_keep(p_mobile text, p_code text, p_device text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; v_sid uuid; cur jsonb; d jsonb;
  pf jsonb; cd jsonb; k text; s text; u jsonb;
begin
  a := auth(p_mobile, p_code, p_device);
  if not coalesce((a->>'ok')::boolean, false) then return a; end if;
  v_sid := (a->>'id')::uuid;
  d := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  select coalesce(keep, '{}'::jsonb) into cur from cbt_private.students where id = v_sid;

  if p_action = 'get' then
    -- cdgone: the countdown was removed on purpose (another phone must not bring it back)
    return jsonb_build_object('ok', true, 'pf', cur->'pf', 'cd', cur->'cd', 'cdgone', cur ? 'cdgone');
  end if;
  if p_action <> 'save' then return jsonb_build_object('ok', false, 'error', 'action'); end if;

  -- profile details: short text only, no markup characters; the photo must be a small picture
  if d ? 'pf' then
    if jsonb_typeof(d->'pf') = 'object' then
      pf := '{}'::jsonb;
      foreach k in array array['name', 'email', 'phone', 'school', 'city', 'cls', 'exam', 'about'] loop
        s := left(btrim(regexp_replace(coalesce(d->'pf'->>k, ''), '[<>"`]', '', 'g')),
                  case k when 'about' then 300 when 'email' then 120 when 'school' then 100 else 60 end);
        if s <> '' then pf := pf || jsonb_build_object(k, s); end if;
      end loop;
      s := coalesce(d->'pf'->>'photo', '');
      if length(s) <= 120000 and s ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
        pf := pf || jsonb_build_object('photo', s);
      end if;
      cur := cur || jsonb_build_object('pf', pf);
    elsif jsonb_typeof(d->'pf') = 'null' then
      cur := cur - 'pf';
    end if;
  end if;

  -- exam countdown: a name, an ISO date, when it was set and which units to show
  if d ? 'cd' then
    if jsonb_typeof(d->'cd') = 'object' then
      s := left(btrim(regexp_replace(coalesce(d->'cd'->>'name', ''), '[<>"`]', '', 'g')), 60);
      if s <> '' and coalesce(d->'cd'->>'date', '') ~ '^\d{4}-\d\d-\d\dT[0-9:.]+Z$' then
        -- only the six known units, once each, in the app's order
        u := coalesce((select jsonb_agg(t.unit order by t.ord)
                         from unnest(array['months', 'weeks', 'days', 'hours', 'minutes', 'seconds']) with ordinality as t(unit, ord)
                        where t.unit in (select jsonb_array_elements_text(
                                case when jsonb_typeof(d->'cd'->'units') = 'array' then d->'cd'->'units' else '[]'::jsonb end))),
                      '["days","hours","minutes"]'::jsonb);
        cd := jsonb_build_object('name', s, 'date', d->'cd'->>'date', 'units', u);
        if coalesce(d->'cd'->>'start', '') ~ '^\d{10,14}$' then cd := cd || jsonb_build_object('start', (d->'cd'->>'start')::bigint); end if;
        cur := (cur - 'cdgone') || jsonb_build_object('cd', cd);
      end if;
    elsif jsonb_typeof(d->'cd') = 'null' then
      cur := (cur - 'cd') || jsonb_build_object('cdgone', true);
    end if;
  end if;

  if length(cur::text) > 200000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  update cbt_private.students set keep = cur where id = v_sid;
  return jsonb_build_object('ok', true);
end $$;
-- the site calls with the public (anon) key; like every cbt_* function, not open to the authenticated role
revoke all on function public.cbt_keep(text, text, text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_keep(text, text, text, text, jsonb) to anon;

notify pgrst, 'reload schema';
