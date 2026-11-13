-- =====================================================================
--  v78: "What was added when" for the weekly schedule
--
--  The weekly schedule on Home showed only tests (on the day they go live). Now each day also shows what the
--  admin added to the series that day: files (schedule, syllabus, notes, PDFs), announcements and the answer-key
--  PDF of a test. Students get only what they may see:
--   • files: name and date for everyone (the file itself still opens only by the v77 rules);
--   • announcements: only students who have the series;
--   • answer-key PDFs: only students who have the series, dated when they become visible (after the result time).
--
--  Run in Supabase → SQL Editor after v77. Safe to run again. Read only: nothing is stored, nothing changes.
-- =====================================================================

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
               'locked', fl.kind <> 'schedule' and not v_ok) x
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

notify pgrst, 'reload schema';
