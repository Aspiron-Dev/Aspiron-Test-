-- =====================================================================
--  v77: Free vs paid students inside a test series + resource folders + announcements
--
--  A student who has NOT bought a series (e.g. signed up with email) can explore it, but most things stay locked.
--  Every rule below is checked by the database itself, so nothing can be opened by changing the app or calling
--  the API directly:
--   • Description: open to all (as before).
--   • Resources: only files of type "Schedule" open; every other file (syllabus, notes, PDFs) is refused.
--   • Tests: the FIRST test of every series (the first one in the admin's order) is free; all others are locked.
--   • Answer-key PDFs (Google Drive links): only for students who have the series.
--   • Announcements (new): only for students who have the series.
--   • Reviews: everyone can read them; only students who have the series can write (as before, v23).
--  Admin:
--   • Test studio → series → Cover & files: put files in folders and move them up / down.
--   • Test studio → series → Announcements: write, edit and delete announcements for that series.
--
--  Run in Supabase → SQL Editor after v76, THEN run supabase_v35_admin_team.sql again.  Safe to run again.
--  Costs nothing: no cron, no extension, no storage.
-- =====================================================================

-- ---------- the first test of a series (free for everyone) ----------
create or replace function cbt_private.first_test(p_series uuid) returns uuid
language sql stable security definer set search_path = cbt_private, pg_temp as $$
  select t.id from tests t left join folders f on f.id = t.folder_id
   where t.series_id = p_series and t.active and (t.folder_id is null or f.active)
   order by t.sort_order, t.created_at, t.id limit 1
$$;
revoke all on function cbt_private.first_test(uuid) from public, anon, authenticated;

-- ---------- resource folders and order ----------
alter table cbt_private.series_files add column if not exists folder text not null default '';
alter table cbt_private.series_files add column if not exists sort_order int not null default 0;

-- ---------- cbt_catalog (from v48: files with folder / order / locked, first test free) ----------
CREATE OR REPLACE FUNCTION public.cbt_catalog(p_mobile text, p_code text, p_device text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  ser jsonb; fol jsonb; tst jsonb; res jsonb; bm jsonb; pend jsonb;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  perform autosubmit(sid, null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',sr.id,'title',sr.title,'description',sr.description,'is_free',sr.is_free,'price_label',sr.price_label,
      'cover_v',case when sr.cover is null then 0 else sr.cover_v end,
      -- v77: folder + order set by the admin; 'locked' = a file this student cannot open (only the schedule is open to all)
      'files',(select coalesce(jsonb_agg(jsonb_build_object('id',fl.id,'title',fl.title,'kind',fl.kind,'size',fl.size,'mime',fl.mime,'name',fl.file_name,
                 'folder',fl.folder,'sort',fl.sort_order,
                 'locked', fl.kind <> 'schedule' and not (sr.is_free or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id)))
                 order by fl.sort_order, fl.created_at),'[]'::jsonb) from series_files fl where fl.series_id = sr.id and fl.ready),
      'unlocked',(sr.is_free or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id))
    ) order by sr.sort_order, sr.created_at),'[]'::jsonb)
  into ser from series sr where sr.active;

  select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'series_id',f.series_id,'title',f.title)
           order by f.sort_order, f.created_at),'[]'::jsonb)
  into fol from folders f join series sr on sr.id = f.series_id and sr.active where f.active;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'series_id',x.series_id,'folder_id',x.folder_id,'title',x.title,'duration',x.duration,
      'questions',x.question_count,'correct',x.correct_marks,'wrong',x.wrong_marks,'free_preview',(x.free_preview or x.id = cbt_private.first_test(x.series_id)),'lock_back',x.lock_back,'practice',x.practice,
      'opens_at',x.opens_at,'closes_at',x.closes_at,'result_at',x.result_at,'sort',x.sort_order,'at',(extract(epoch from x.created_at)*1000)::bigint,
      'locked', not (sr.is_free or x.free_preview or x.id = cbt_private.first_test(x.series_id) or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = x.series_id)),
      'attempts',coalesce(r.cnt,0),
      'best',case when coalesce(x.result_at, x.closes_at) > t then null else r.best end,
      'best_max',case when coalesce(x.result_at, x.closes_at) > t then null else r.best_max end,
      'in_progress',exists(select 1 from sessions se where se.student_id = sid and se.test_id = x.id and not se.submitted and se.ends_at > t)
    ) order by x.sort_order, x.created_at),'[]'::jsonb)
  into tst
  from tests x
  join series sr on sr.id = x.series_id and sr.active
  left join folders f on f.id = x.folder_id
  left join lateral (select count(*)::int cnt, max(rs.score) best, max(rs.max_score) best_max
                     from results rs where rs.student_id = sid and rs.test_id = x.id) r on true
  where x.active and (x.folder_id is null or f.active);

  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'test_id',q.test_id,'title',q.test_title,'score',q.score,
           'max',q.max_score,'correct',q.correct,'wrong',q.wrong,'skipped',q.skipped,'used',q.used_seconds,
           'at',(extract(epoch from q.created_at)*1000)::bigint,'late',q.late) order by q.created_at desc),'[]'::jsonb)
  into res
  from (select * from results where student_id = sid order by created_at desc limit 300) q
  where res_visible(q.test_id::text);

  -- results still held back: only that they were submitted and when they will be shown
  select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'test_id',q.test_id,'title',q.test_title,'late',q.late,
           'at',(extract(epoch from q.created_at)*1000)::bigint,'result_at',coalesce(h.result_at, h.closes_at)) order by q.created_at desc),'[]'::jsonb)
  into pend
  from results q join tests h on h.id = q.test_id
  where q.student_id = sid and coalesce(h.result_at, h.closes_at) > t;

  select coalesce(jsonb_agg(jsonb_build_object('t',b.test_id,'i',b.qidx)),'[]'::jsonb) into bm
  from bookmarks b where b.student_id = sid;

  return jsonb_build_object('ok',true,'now',t,'name',a->>'name','mobile',a->>'mobile','series',ser,'folders',fol,'tests',tst,'results',res,'pending',pend,'bookmarks',bm);
end $function$;
grant execute on function public.cbt_catalog(text, text, text) to anon, authenticated;

-- ---------- cbt_start (from v68: the first test of a series is free) ----------
CREATE OR REPLACE FUNCTION public.cbt_start(p_mobile text, p_code text, p_device text, p_test uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'cbt_private', 'pg_temp'
AS $function$
declare
  a jsonb; sid uuid; t bigint := cbt_private.now_ms();
  x record; sess record; qs jsonb; allowed boolean; lg text;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;

  select tt.*, sr.is_free as s_free, sr.active as s_active into x
  from tests tt join series sr on sr.id = tt.series_id where tt.id = p_test;
  if not found or not x.active or not x.s_active then
    return jsonb_build_object('ok',false,'error','not_found');
  end if;

  allowed := x.s_free or x.free_preview or x.id = cbt_private.first_test(x.series_id)   -- v77: the first test of every series is free
             or exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = x.series_id);
  if not allowed then return jsonb_build_object('ok',false,'error','locked'); end if;

  -- live window over: no new start until the result time (after it the test opens again, outside the rank)
  -- v68: with only "Live ends" set (no result time), the result comes at "Live ends", so the test opens again
  --      right then. Before v68 such a test stayed closed for ever and nobody could re-attempt it.
  if x.closes_at is not null and x.result_at is not null and t > x.closes_at and t < x.result_at
     and not exists(select 1 from sessions where student_id = sid and test_id = p_test and not submitted and ends_at > t) then
    return jsonb_build_object('ok',false,'error','closed','closes_at',x.closes_at,'result_at',x.result_at,'now',t);
  end if;

  if x.opens_at is not null and t < x.opens_at
     and not exists(select 1 from sessions where student_id = sid and test_id = p_test and not submitted) then
    return jsonb_build_object('ok',false,'error','not_open','opens_at',x.opens_at,'now',t);
  end if;

  perform autosubmit(sid, p_test);   -- an expired attempt that was auto-saved gets its result instead of being dropped
  update sessions set submitted = true
   where student_id = sid and test_id = p_test and not submitted and ends_at < t - 120000;

  select * into sess from sessions where student_id = sid and test_id = p_test and not submitted;
  -- v33: live test already submitted -> no second attempt until the result time (or "Live ends" without one)
  if not found and not x.practice and coalesce(x.result_at, x.closes_at) is not null
     and t < coalesce(x.result_at, x.closes_at)
     and exists(select 1 from results where student_id = sid and test_id = p_test) then
    return jsonb_build_object('ok',false,'error','attempted','result_at',coalesce(x.result_at, x.closes_at),'now',t);
  end if;
  if not found then
    -- v43: at most 30 new attempts an hour per student (stops copying the whole question bank)
    if not rate_ok(sid, 'start', 30) then return jsonb_build_object('ok',false,'error','busy'); end if;
    -- v41: the language is fixed here for the whole attempt; a resumed attempt keeps it
    insert into sessions(student_id,test_id,started_at,ends_at,lang)
    values (sid,p_test,t,
            -- v43: during the live window the attempt ends at "Live ends" at the latest (start 8:58, ends 9:00)
            case when x.closes_at is not null and t < x.closes_at then least(t + x.duration::bigint*60000, x.closes_at)
                 else t + x.duration::bigint*60000 end,lang_for(sid,p_test)) returning * into sess;
  end if;

  -- v48 (R5): a practice test sends the answers at the start only when no "Live ends" / result time lies ahead
  select jsonb_agg(case when x.practice and coalesce(x.result_at, x.closes_at, 0) <= t
      then jsonb_build_object('q',e.v->'q','options',e.v->'options','img',e.v->'img','oimg',e.v->'oimg','sec',e.v->'sec',
             'answer',e.v->'answer','explanation',coalesce(e.v->'explanation','""'::jsonb),'eimg',e.v->'eimg')
      else jsonb_build_object('q',e.v->'q','options',e.v->'options','img',e.v->'img','oimg',e.v->'oimg','sec',e.v->'sec') end order by e.n)
  into qs from jsonb_array_elements(x.data) with ordinality as e(v,n);

  lg := case when sess.lang = 'hi' and exists(select 1 from test_hi h where h.test_id = p_test
                and jsonb_array_length(h.data) = jsonb_array_length(coalesce(qs,'[]'::jsonb))) then 'hi' else 'en' end;
  qs := qs_lang(qs, p_test, lg);

  return jsonb_build_object('ok',true,'now',t,
    'session',jsonb_build_object('id',sess.id,'started_at',sess.started_at,'ends_at',sess.ends_at,'lang',lg),
    'test',jsonb_build_object('id',x.id,'title',x.title,'duration',x.duration,'correct',x.correct_marks,
            'wrong',x.wrong_marks,'lock_back',x.lock_back,'practice',x.practice,'lang',lg,'questions',coalesce(qs,'[]'::jsonb)));
end $function$;
grant execute on function public.cbt_start(text, text, text, uuid) to anon, authenticated;

-- ---------- cbt_file_part (from v43: a "Schedule" file opens for everyone, other files need the series) ----------
create or replace function public.cbt_file_part(p_mobile text, p_code text, p_device text, p_file uuid, p_n integer)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; f record; d text;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  select fl.*, sr.is_free into f from series_files fl join series sr on sr.id = fl.series_id and sr.active where fl.id = p_file and fl.ready;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if not (f.is_free or f.kind = 'schedule'
          or exists (select 1 from series_access ac where ac.student_id = (a->>'id')::uuid and ac.series_id = f.series_id)) then
    return jsonb_build_object('ok',false,'error','locked');
  end if;
  if f.opens_at is not null and f.opens_at > now_ms() then
    return jsonb_build_object('ok',false,'error','not_open','opens_at',f.opens_at);
  end if;
  select data into d from file_parts where file_id = p_file and n = p_n;
  return jsonb_build_object('ok',true,'data',d,'parts',f.parts,'mime',f.mime,'name',f.file_name);
end $$;
grant execute on function public.cbt_file_part(text, text, text, uuid, integer) to anon, authenticated;

-- ---------- answer-key PDFs (from v68): only for students who have the series ----------
create or replace function public.cbt_test_pdfs(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; t bigint := cbt_private.now_ms();
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_object_agg(p.test_id, jsonb_build_object('url', p.url, 'label', p.label))
      from cbt_private.test_pdfs p
      join cbt_private.tests tt on tt.id::text = p.test_id
      join jsonb_array_elements(coalesce(c->'series', '[]'::jsonb)) s on s.value->>'id' = tt.series_id::text
     where coalesce((s.value->>'unlocked')::boolean, false)
       and tt.active
       and (tt.practice or coalesce(tt.result_at, tt.closes_at) is null or coalesce(tt.result_at, tt.closes_at) <= t)), '{}'::jsonb));
end $$;
grant execute on function public.cbt_test_pdfs(text, text, text) to anon, authenticated;

-- ---------- admin: files (from v43) + 'arrange' {series_id, items:[{id, folder, sort}]} ----------
create or replace function public.cbt_admin_files(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_t text; it jsonb; n int := 0;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'files', coalesce((select jsonb_object_agg(id::text, opens_at) from series_files
             where series_id::text = coalesce(d->>'series_id', '') and opens_at is not null), '{}'::jsonb),
      'layout', coalesce((select jsonb_object_agg(id::text, jsonb_build_object('folder', folder, 'sort', sort_order)) from series_files
             where series_id::text = coalesce(d->>'series_id', '')), '{}'::jsonb));
  elsif p_action = 'set' then
    update series_files set opens_at = case when coalesce(d->>'at', '') ~ '^[0-9]{10,14}$' then (d->>'at')::bigint end
     where id::text = coalesce(d->>'id', '') returning title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  elsif p_action = 'arrange' then
    if jsonb_typeof(d->'items') is distinct from 'array' or jsonb_array_length(d->'items') > 300 then
      return jsonb_build_object('ok', false, 'error', 'items');
    end if;
    for it in select value from jsonb_array_elements(d->'items') loop
      update series_files
         set folder = left(btrim(regexp_replace(coalesce(it->>'folder', ''), '[<>\\\r\n\t]', '', 'g')), 60),
             sort_order = case when coalesce(it->>'sort', '') ~ '^[0-9]{1,5}$' then (it->>'sort')::int else sort_order end
       where id::text = coalesce(it->>'id', '') and series_id::text = coalesce(d->>'series_id', '');
      if found then n := n + 1; end if;
    end loop;
    perform set_config('cbt.detail', n || ' files', true);
    return jsonb_build_object('ok', true, 'n', n);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_files(text, text, jsonb) to anon, authenticated;

-- ---------- announcements per series (only for students who have the series) ----------
create table if not exists cbt_private.series_posts (
  id         uuid primary key default gen_random_uuid(),
  series_id  uuid not null references cbt_private.series(id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists series_posts_series on cbt_private.series_posts (series_id, created_at desc);
alter table cbt_private.series_posts enable row level security;
revoke all on cbt_private.series_posts from public, anon, authenticated;

create or replace function public.cbt_series_posts(p_mobile text, p_code text, p_device text, p_series text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if coalesce(p_series, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not exists (select 1 from series sr where sr.id = p_series::uuid and sr.active
                   and (sr.is_free or exists (select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id))) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'body', p.body,
      'pinned', p.pinned, 'at', (extract(epoch from p.created_at) * 1000)::bigint) order by p.pinned desc, p.created_at desc)
    from (select * from series_posts where series_id = p_series::uuid order by pinned desc, created_at desc limit 100) p), '[]'::jsonb));
end $$;
grant execute on function public.cbt_series_posts(text, text, text, text) to anon, authenticated;

-- actions: get {series_id} | save {id?, series_id, title, body, pinned} | delete {id}
create or replace function public.cbt_admin_series_posts(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_id uuid;
        v_title text := left(btrim(regexp_replace(coalesce(d->>'title', ''), '[<>\\\r\n\t]', '', 'g')), 120);
        v_body text := left(btrim(regexp_replace(coalesce(d->>'body', ''), '[<>\\]', '', 'g')), 3000);
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body,
        'pinned', pinned, 'at', (extract(epoch from created_at) * 1000)::bigint) order by pinned desc, created_at desc)
      from series_posts where series_id::text = coalesce(d->>'series_id', '')), '[]'::jsonb));
  elsif p_action = 'save' then
    if v_title = '' and v_body = '' then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
    if coalesce(d->>'id', '') <> '' then
      update series_posts set title = v_title, body = v_body, pinned = coalesce((d->>'pinned')::boolean, false), updated_at = now()
       where id::text = d->>'id' returning id into v_id;
      if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    else
      if not exists (select 1 from series where id::text = coalesce(d->>'series_id', '')) then
        return jsonb_build_object('ok', false, 'error', 'series');
      end if;
      insert into series_posts (series_id, title, body, pinned)
      values ((d->>'series_id')::uuid, v_title, v_body, coalesce((d->>'pinned')::boolean, false)) returning id into v_id;
    end if;
    perform set_config('cbt.detail', left(v_title, 120), true);
    return jsonb_build_object('ok', true, 'id', v_id);
  elsif p_action = 'delete' then
    delete from series_posts where id::text = coalesce(d->>'id', '');
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_series_posts(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
