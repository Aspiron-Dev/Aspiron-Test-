-- =====================================================================
--  v11: PYQ Analysis (previous year questions, chapter & topic wise)
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again.
-- =====================================================================

create table if not exists public.cbt_pyq (
  id          uuid primary key default gen_random_uuid(),
  exam        text not null default 'NEET',
  subject     text not null,              -- phy | chem | bio
  chapter     text not null,              -- chapter id from pyq-syllabus.js
  topic       text not null default '',
  year        int  not null,
  paper       text not null,              -- e.g. "NEET 2024", "NEET 2024 Re-exam", "AIPMT 2015"
  qno         int,
  q           text not null,
  options     jsonb not null default '[]'::jsonb,
  answer      int,
  explanation text not null default '',
  has_img     boolean not null default false,
  rkey        text not null default '',     -- normalised text, same key = repeated question
  created_at  timestamptz not null default now()
);
create index if not exists cbt_pyq_ch on public.cbt_pyq (exam, subject, chapter);
create index if not exists cbt_pyq_rk on public.cbt_pyq (exam, rkey);
alter table public.cbt_pyq enable row level security;
revoke all on public.cbt_pyq from anon, authenticated;

-- Students: counts per subject / chapter / topic / paper (small, cached by the app)
create or replace function public.cbt_pyq_summary(p_mobile text, p_code text, p_device text, p_exam text default 'NEET')
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_array(subject, chapter, topic, year, paper, n) order by year)
    from (select subject, chapter, topic, year, paper, count(*) n from public.cbt_pyq where exam = p_exam group by 1,2,3,4,5) x), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_pyq_summary(text, text, text, text) to anon, authenticated;

-- Students: all questions of one chapter, with how many times each was asked
create or replace function public.cbt_pyq_chapter(p_mobile text, p_code text, p_device text, p_exam text, p_chapter text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 't', topic, 'y', year, 'p', paper, 'n', qno, 'q', q, 'o', options, 'a', answer, 'e', explanation, 'img', has_img, 'k', rkey,
             'rep', (select jsonb_agg(distinct r.paper) from public.cbt_pyq r where r.exam = p.exam and r.rkey = p.rkey and r.rkey <> '' ))
             order by year desc, qno)
    from public.cbt_pyq p where exam = p_exam and chapter = p_chapter), '[]'::jsonb));
end; $$;
grant execute on function public.cbt_pyq_chapter(text, text, text, text, text) to anon, authenticated;

-- Admin: papers / list / bulk add / update / delete / delete a whole paper
create or replace function public.cbt_admin_pyq(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb; x jsonb; n int := 0; v_exam text := coalesce(p_data->>'exam', 'NEET');
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'papers' then
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('paper', paper, 'year', year, 'n', n, 'subjects', s) order by year desc, paper)
      from (select paper, year, count(*) n, jsonb_agg(distinct subject) s from public.cbt_pyq where exam = v_exam group by paper, year) y), '[]'::jsonb),
      'total', (select count(*) from public.cbt_pyq where exam = v_exam));

  elsif p_action = 'list' then
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'subject', subject, 'chapter', chapter, 'topic', topic, 'year', year, 'paper', paper, 'qno', qno, 'q', left(q, 300)) order by year desc, qno)
      from (select * from public.cbt_pyq where exam = v_exam
              and (coalesce(p_data->>'paper','') = '' or paper = p_data->>'paper')
              and (coalesce(p_data->>'chapter','') = '' or chapter = p_data->>'chapter')
            order by year desc, qno limit 400) l), '[]'::jsonb));

  elsif p_action = 'bulk' then
    for x in select * from jsonb_array_elements(coalesce(p_data->'items', '[]'::jsonb)) loop
      exit when n >= 400;
      insert into public.cbt_pyq (exam, subject, chapter, topic, year, paper, qno, q, options, answer, explanation, has_img, rkey)
      values (v_exam, left(x->>'subject', 10), left(x->>'chapter', 40), left(coalesce(x->>'topic', ''), 80), (x->>'year')::int, left(x->>'paper', 60),
              nullif(x->>'qno', '')::int, left(x->>'q', 4000), coalesce(x->'options', '[]'::jsonb), nullif(x->>'answer', '')::int,
              left(coalesce(x->>'explanation', ''), 4000), coalesce((x->>'has_img')::boolean, false), left(coalesce(x->>'rkey', ''), 120));
      n := n + 1;
    end loop;
    return jsonb_build_object('ok', true, 'added', n);

  elsif p_action = 'update' then
    update public.cbt_pyq set subject = coalesce(p_data->>'subject', subject), chapter = coalesce(p_data->>'chapter', chapter), topic = coalesce(p_data->>'topic', topic)
     where id = (p_data->>'id')::uuid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete' then
    delete from public.cbt_pyq where id = (p_data->>'id')::uuid;
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete_paper' then
    delete from public.cbt_pyq where exam = v_exam and paper = p_data->>'paper';
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_pyq(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
