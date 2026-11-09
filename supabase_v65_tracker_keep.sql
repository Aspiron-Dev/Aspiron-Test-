-- =====================================================================
--  v65: the study tracker is kept on the account too
--
--  • Until now the study tracker (weeks, subjects, tasks, targets) and the "done today" counts lived only inside one
--    browser. Clearing site data, another browser or a new phone meant the whole plan was gone.
--  • This adds them to cbt_keep (v56), next to the profile and the exam countdown: the signed-in student saves and reads
--    their own copy; nobody else can. Every value is checked and cut to size here (text without markup characters,
--    colours as #rrggbb, numbers in range, limits on weeks / subjects / tasks), nothing else is stored.
--  • 'trkat' is when the tracker was last changed on a phone, so the app keeps the newest copy.
--  • Everything v56 did stays exactly the same. Before this file is run the app works as before (tracker on the phone).
--
--  Run in Supabase → SQL Editor. Safe to run again. Needs v56 (supabase_v56_student_keep.sql) first.
-- =====================================================================

alter table cbt_private.students add column if not exists keep jsonb not null default '{}'::jsonb;

-- short clean text: no markup characters, trimmed, cut to n characters
create or replace function cbt_private.keep_txt(v jsonb, n int) returns text language sql immutable as $$
  select left(btrim(regexp_replace(case when jsonb_typeof(v) = 'string' then v #>> '{}' when jsonb_typeof(v) = 'number' then v::text else '' end,
                                   '[<>"`]', '', 'g')), n)
$$;
-- an id the app made: a whole number, or a short word of letters / digits / - / _
create or replace function cbt_private.keep_id(v jsonb) returns jsonb language sql immutable as $$
  select case
    when jsonb_typeof(v) = 'number' and (v #>> '{}') ~ '^\d{1,12}$' then v
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[A-Za-z0-9_-]{1,24}$' then v
    else null end
$$;

-- the tracker, rebuilt from only the parts the app uses; null when it is not a tracker at all
create or replace function cbt_private.keep_trk(t jsonb) returns jsonb language plpgsql immutable as $$
declare weeks jsonb; goals jsonb; nw int;
begin
  if jsonb_typeof(t) <> 'object' or jsonb_typeof(t->'weeks') <> 'array' then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', coalesce(cbt_private.keep_id(w->'id'), to_jsonb('w' || wi)),
           'label', coalesce(nullif(cbt_private.keep_txt(w->'label', 30), ''), 'Week ' || wi),
           'subjects', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', coalesce(cbt_private.keep_id(s->'id'), to_jsonb('s' || si)),
                      'name', coalesce(nullif(cbt_private.keep_txt(s->'name', 24), ''), 'Subject'),
                      'emoji', cbt_private.keep_txt(s->'emoji', 8),
                      'color', case when coalesce(s->>'color', '') ~ '^#[0-9a-fA-F]{6}$' then s->>'color' else '#6366f1' end,
                      'tasks', coalesce((
                        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                 'id', coalesce(cbt_private.keep_id(k->'id'), to_jsonb(ki)),
                                 'text', cbt_private.keep_txt(k->'text', 120),
                                 'done', coalesce(k->'done' = 'true'::jsonb, false),
                                 'at', case when coalesce(k->>'at', '') ~ '^\d{10,14}$' then (k->>'at')::bigint end)) order by ki)
                          from jsonb_array_elements(case when jsonb_typeof(s->'tasks') = 'array' then s->'tasks' else '[]'::jsonb end)
                               with ordinality as tk(k, ki)
                         where ki <= 300 and jsonb_typeof(k) = 'object' and cbt_private.keep_txt(k->'text', 120) <> ''), '[]'::jsonb)) order by si)
               from jsonb_array_elements(case when jsonb_typeof(w->'subjects') = 'array' then w->'subjects' else '[]'::jsonb end)
                    with ordinality as sb(s, si)
              where si <= 30 and jsonb_typeof(s) = 'object'), '[]'::jsonb)) order by wi), '[]'::jsonb)
    into weeks
    from jsonb_array_elements(t->'weeks') with ordinality as wk(w, wi)
   where wi <= 104 and jsonb_typeof(w) = 'object';
  nw := jsonb_array_length(weeks);
  if nw = 0 then return null; end if;
  -- targets: subject id → 1..999
  select coalesce(jsonb_object_agg(g.key, least(999, greatest(1, (g.value #>> '{}')::int))), '{}'::jsonb) into goals
    from jsonb_each(case when jsonb_typeof(t->'goals') = 'object' then t->'goals' else '{}'::jsonb end) g
   where g.key ~ '^[A-Za-z0-9_-]{1,24}$' and jsonb_typeof(g.value) = 'number' and (g.value #>> '{}') ~ '^\d{1,3}$';
  return jsonb_build_object('weeks', weeks, 'goals', goals,
    'cur', case when coalesce(t->>'cur', '') ~ '^\d{1,3}$' then least((t->>'cur')::int, nw - 1) else 0 end,
    'nid', case when coalesce(t->>'nid', '') ~ '^\d{1,9}$' then (t->>'nid')::int else 1 end);
end $$;

-- tasks ticked per day: 'yyyy-m-d' → 0..999, the newest 400 days
create or replace function cbt_private.keep_trkd(t jsonb) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(key, val), '{}'::jsonb) from (
    select d.key, least(999, greatest(0, (d.value #>> '{}')::int)) as val
      from jsonb_each(case when jsonb_typeof(t) = 'object' then t else '{}'::jsonb end) d
     where d.key ~ '^\d{4}-\d{1,2}-\d{1,2}$' and jsonb_typeof(d.value) = 'number' and (d.value #>> '{}') ~ '^\d{1,3}$'
     order by to_date(d.key, 'YYYY-MM-DD') desc limit 400) x
$$;

create or replace function public.cbt_keep(p_mobile text, p_code text, p_device text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; v_sid uuid; cur jsonb; d jsonb;
  pf jsonb; cd jsonb; k text; s text; u jsonb; tr jsonb;
begin
  a := auth(p_mobile, p_code, p_device);
  if not coalesce((a->>'ok')::boolean, false) then return a; end if;
  v_sid := (a->>'id')::uuid;
  d := case when jsonb_typeof(p_data) = 'object' then p_data else '{}'::jsonb end;
  select coalesce(keep, '{}'::jsonb) into cur from cbt_private.students where id = v_sid;

  if p_action = 'get' then
    -- cdgone: the countdown was removed on purpose (another phone must not bring it back)
    return jsonb_build_object('ok', true, 'pf', cur->'pf', 'cd', cur->'cd', 'cdgone', cur ? 'cdgone',
                              'trk', cur->'trk', 'trkd', cur->'trkd', 'trkat', cur->'trkat');
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

  -- study tracker (v65): the whole plan, rebuilt clean; null clears it ("Delete everything")
  if d ? 'trk' then
    if jsonb_typeof(d->'trk') = 'null' then
      cur := cur - 'trk';
    else
      if length((d->'trk')::text) > 150000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
      tr := cbt_private.keep_trk(d->'trk');
      if tr is null then return jsonb_build_object('ok', false, 'error', 'trk'); end if;
      cur := cur || jsonb_build_object('trk', tr);
    end if;
    -- when it was changed on the phone (ms); never in the future
    cur := cur || jsonb_build_object('trkat', case when coalesce(d->>'trkat', '') ~ '^\d{10,14}$'
                    then least((d->>'trkat')::bigint, (extract(epoch from now()) * 1000)::bigint) else (extract(epoch from now()) * 1000)::bigint end);
  end if;
  if d ? 'trkd' then
    if jsonb_typeof(d->'trkd') = 'null' then cur := cur - 'trkd';
    else cur := cur || jsonb_build_object('trkd', cbt_private.keep_trkd(d->'trkd')); end if;
  end if;

  if length(cur::text) > 400000 then return jsonb_build_object('ok', false, 'error', 'too_big'); end if;
  update cbt_private.students set keep = cur where id = v_sid;
  return jsonb_build_object('ok', true);
end $$;
-- the site calls with the public (anon) key; like every cbt_* function, not open to the authenticated role
revoke all on function public.cbt_keep(text, text, text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_keep(text, text, text, text, jsonb) to anon;
revoke all on function cbt_private.keep_txt(jsonb, int), cbt_private.keep_id(jsonb), cbt_private.keep_trk(jsonb),
                       cbt_private.keep_trkd(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
