-- =====================================================================
--  v89: free or paid, one file at a time, and Google Drive links for files
--
--  Series files (Schedule, Syllabus, Notes, PDFs in Resources) could only be opened by students who have the series,
--  except the Schedule. Now the admin picks for every file: "Everyone (free)" or "Students who have the series".
--  A file can also be a Google Drive link instead of an upload (nothing is stored on the backend but the link).
--
--  • New columns on series_files: free (default false = same as before) and url (a Drive link; '' for uploaded files).
--  • One rule for "can this student open the file": cbt_private.file_locked (the Schedule is always open, a free file is
--    open, a free series is open, a student who has the series is open). Used by the catalog, the file reader and the feed.
--  • The Drive link is never sent in the catalog or the feed. A student gets it only from cbt_file_link, which applies the
--    same lock and the "opens at" time. Uploaded files and the old app work as before.
--  • Admin (cbt_admin_files): new actions 'free' {id, free} and 'link' {series_id, title, kind, url, free}; 'get' also
--    returns free and link per file.
--
--  Run ONCE in Supabase → SQL Editor after v88, and then run supabase_v35_admin_team.sql again (it re-applies the
--  admin permissions to cbt_admin_files). Safe to run again. Existing files stay as they are (free = false).
-- =====================================================================

alter table cbt_private.series_files add column if not exists free boolean not null default false;
alter table cbt_private.series_files add column if not exists url  text    not null default '';

-- the one rule: true = this student cannot open the file
create or replace function cbt_private.file_locked(p_kind text, p_free boolean, p_series_free boolean, p_enrolled boolean)
returns boolean language sql immutable as $$
  select not (coalesce(p_kind, '') = 'schedule' or coalesce(p_free, false) or coalesce(p_series_free, false) or coalesce(p_enrolled, false))
$$;
revoke all on function cbt_private.file_locked(text, boolean, boolean, boolean) from public, anon, authenticated;

-- ---------- catalog (v77) with free / link / the new lock rule ----------
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
                 'free',fl.free,'link',(fl.url <> ''),
                 'locked', cbt_private.file_locked(fl.kind, fl.free, sr.is_free, exists(select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id)))
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

-- ---------- file reader (v77): same lock rule; a Drive link has no parts ----------
create or replace function public.cbt_file_part(p_mobile text, p_code text, p_device text, p_file uuid, p_n integer)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; f record; d text;
begin
  a := auth(p_mobile,p_code,p_device);
  if not (a->>'ok')::boolean then return a; end if;
  select fl.*, sr.is_free into f from series_files fl join series sr on sr.id = fl.series_id and sr.active where fl.id = p_file and fl.ready;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  if cbt_private.file_locked(f.kind, f.free, f.is_free, exists (select 1 from series_access ac where ac.student_id = (a->>'id')::uuid and ac.series_id = f.series_id)) then
    return jsonb_build_object('ok',false,'error','locked');
  end if;
  if f.opens_at is not null and f.opens_at > now_ms() then
    return jsonb_build_object('ok',false,'error','not_open','opens_at',f.opens_at);
  end if;
  if f.url <> '' then return jsonb_build_object('ok',false,'error','link'); end if;   -- a Drive link has no parts: use cbt_file_link
  select data into d from file_parts where file_id = p_file and n = p_n;
  return jsonb_build_object('ok',true,'data',d,'parts',f.parts,'mime',f.mime,'name',f.file_name);
end $$;
grant execute on function public.cbt_file_part(text, text, text, uuid, integer) to anon, authenticated;

-- ---------- weekly feed (v78): same lock rule ----------
create or replace function public.cbt_series_feed(p_mobile text, p_code text, p_device text, p_series text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; sid uuid; v_ser uuid; v_ok boolean; t bigint := cbt_private.now_ms();
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  sid := (a->>'id')::uuid;
  if coalesce(p_series, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  v_ser := p_series::uuid;
  select sr.is_free or exists (select 1 from series_access ac where ac.student_id = sid and ac.series_id = sr.id)
    into v_ok from series sr where sr.id = v_ser and sr.active;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(x order by (x->>'at')::bigint desc) from (
      -- files: when they were added (or when they open, if later)
      select jsonb_build_object('k', 'file', 'id', fl.id, 'title', fl.title, 'kind', fl.kind,
               'at', greatest((extract(epoch from fl.created_at) * 1000)::bigint, coalesce(fl.opens_at, 0)),
               'link', (fl.url <> ''), 'locked', cbt_private.file_locked(fl.kind, fl.free, false, v_ok)) x
        from series_files fl where fl.series_id = v_ser and fl.ready
      union all
      -- announcements: enrolled students only
      select jsonb_build_object('k', 'post', 'id', p.id, 'title', coalesce(nullif(p.title, ''), left(p.body, 80)),
               'at', (extract(epoch from p.created_at) * 1000)::bigint)
        from series_posts p where p.series_id = v_ser and v_ok
      union all
      -- answer-key PDFs: enrolled students only, from the moment they can open them
      select jsonb_build_object('k', 'pdf', 'id', p.test_id, 'test_id', p.test_id, 'title', coalesce(nullif(p.label, ''), tt.title),
               'at', greatest((extract(epoch from p.updated_at) * 1000)::bigint,
                              case when tt.practice then 0 else coalesce(tt.result_at, tt.closes_at, 0) end))
        from test_pdfs p join tests tt on tt.id::text = p.test_id
       where tt.series_id = v_ser and tt.active and v_ok
         and (tt.practice or coalesce(tt.result_at, tt.closes_at) is null or coalesce(tt.result_at, tt.closes_at) <= t)
    ) z limit 400), '[]'::jsonb));
end $$;
revoke all on function public.cbt_series_feed(text, text, text, text) from public, authenticated;
grant execute on function public.cbt_series_feed(text, text, text, text) to anon;

-- ---------- a Drive-link file: the link goes only to a student who may open it now ----------
create or replace function public.cbt_file_link(p_mobile text, p_code text, p_device text, p_file uuid)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; f record;
begin
  a := auth(p_mobile, p_code, p_device);
  if not (a->>'ok')::boolean then return a; end if;
  select fl.*, sr.is_free into f from series_files fl join series sr on sr.id = fl.series_id and sr.active where fl.id = p_file and fl.ready and fl.url <> '';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if cbt_private.file_locked(f.kind, f.free, f.is_free, exists (select 1 from series_access ac where ac.student_id = (a->>'id')::uuid and ac.series_id = f.series_id)) then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if f.opens_at is not null and f.opens_at > now_ms() then
    return jsonb_build_object('ok', false, 'error', 'not_open', 'opens_at', f.opens_at);
  end if;
  return jsonb_build_object('ok', true, 'url', f.url, 'title', f.title);
end $$;
revoke all on function public.cbt_file_link(text, text, text, uuid) from public, authenticated;
grant execute on function public.cbt_file_link(text, text, text, uuid) to anon;

-- ---------- admin: files (v85) + 'free' and 'link' ----------
-- actions: get | set | arrange | order | free {id, free} | link {series_id, title, kind, url, free}
create or replace function public.cbt_admin_files(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_t text; it jsonb; n int := 0; v_sid uuid; v_o jsonb; v_url text; v_fid uuid;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'v85', true, 'v89', true,
      'files', coalesce((select jsonb_object_agg(id::text, opens_at) from series_files
             where series_id::text = coalesce(d->>'series_id', '') and opens_at is not null), '{}'::jsonb),
      'layout', coalesce((select jsonb_object_agg(id::text, jsonb_build_object('folder', folder, 'sort', sort_order, 'free', free, 'link', url <> '')) from series_files
             where series_id::text = coalesce(d->>'series_id', '')), '{}'::jsonb),
      'order', coalesce((select res_order from series_meta where series_id::text = coalesce(d->>'series_id', '')), '[]'::jsonb));
  elsif p_action = 'set' then
    update series_files set opens_at = case when coalesce(d->>'at', '') ~ '^[0-9]{10,14}$' then (d->>'at')::bigint end
     where id::text = coalesce(d->>'id', '') returning title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  elsif p_action = 'free' then   -- {id, free}: who can open one file (everyone / only students who have the series)
    update series_files set free = (coalesce(d->>'free', '') = 'true')
     where id::text = coalesce(d->>'id', '') returning title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 100) || case when coalesce(d->>'free', '') = 'true' then ' (free for all)' else ' (buyers only)' end, true);
    return jsonb_build_object('ok', true);
  elsif p_action = 'link' then   -- {series_id, title, kind, url, free}: a Google Drive file shown like an uploaded one
    v_url := btrim(coalesce(d->>'url', ''));
    if length(v_url) > 500 or v_url !~ '^https://(drive|docs)\.google\.com/[A-Za-z0-9/_?=&%.#~+-]+$' then
      return jsonb_build_object('ok', false, 'error', 'url');
    end if;
    begin v_sid := (d->>'series_id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'series'); end;
    if v_sid is null or not exists (select 1 from series where id = v_sid) then return jsonb_build_object('ok', false, 'error', 'series'); end if;
    if (select count(*) from series_files where series_id = v_sid) >= 200 then return jsonb_build_object('ok', false, 'error', 'many'); end if;
    insert into series_files (series_id, title, kind, file_name, mime, size, parts, ready, url, free)
    values (v_sid, left(coalesce(nullif(btrim(d->>'title'), ''), 'File'), 80),
            case when d->>'kind' in ('syllabus', 'schedule', 'notes') then d->>'kind' else 'syllabus' end,
            'Google Drive', 'link', 0, 0, true, v_url, coalesce(d->>'free', '') = 'true')
    returning id into v_fid;
    perform set_config('cbt.detail', left(coalesce(nullif(btrim(d->>'title'), ''), 'File'), 100) || ' (Drive link)', true);
    return jsonb_build_object('ok', true, 'id', v_fid);
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
  elsif p_action = 'order' then
    begin v_sid := (d->>'series_id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'series'); end;
    if v_sid is null or not exists (select 1 from series where id = v_sid) then return jsonb_build_object('ok', false, 'error', 'series'); end if;
    if jsonb_typeof(d->'names') is distinct from 'array' or jsonb_array_length(d->'names') > 100
       or exists (select 1 from jsonb_array_elements(d->'names') v where jsonb_typeof(v) <> 'string') then
      return jsonb_build_object('ok', false, 'error', 'names');
    end if;
    -- clean names, no empty ones, no repeats (first one wins)
    select coalesce(jsonb_agg(x.nm order by x.i), '[]'::jsonb) into v_o from (
      select distinct on (lower(cbt_private.res_folder(v #>> '{}'))) cbt_private.res_folder(v #>> '{}') nm, i
        from jsonb_array_elements(d->'names') with ordinality u(v, i)
       where cbt_private.res_folder(v #>> '{}') <> ''
       order by lower(cbt_private.res_folder(v #>> '{}')), i) x;
    insert into series_meta as m (series_id, res_order, updated_at) values (v_sid, v_o, now())
    on conflict (series_id) do update set res_order = excluded.res_order, updated_at = now();
    perform set_config('cbt.detail', jsonb_array_length(v_o) || ' folders', true);
    return jsonb_build_object('ok', true, 'order', v_o);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_files(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
