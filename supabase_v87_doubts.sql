-- =====================================================================
--  v87: Doubts — a student asks a doubt on a question of a test, a teacher answers it in the admin panel
--  • A student can ask a doubt on a question of a test they have taken, once its result is out (the same rule as the
--    answer key: a doubt on a live test could leak answers). Text only, 5 to 1200 letters, no markup characters.
--  • My Doubts shows the student's own doubts and the answers. Nobody else sees them: other students never, teachers
--    only in Admin → Doubts.
--  • Limits: 20 new doubts an hour and 30 a day per student, and at most 3 doubts still waiting on one question.
--  • The admin sees every doubt (waiting first), answers it, closes it without an answer, or deletes it. Who may do
--    this: the Messaging module (View = read, Full access = answer / close / delete).
--  • A doubt is kept when its test is deleted (the test title and a short copy of the question stay on it).
--  Nothing existing is changed or deleted. Safe to run again.
--  Run in Supabase → SQL Editor after v86, then run supabase_v35_admin_team.sql AGAIN (it wraps the new admin
--  function; until then only the owner's password can use it). Before it is run the app simply does not offer doubts.
-- =====================================================================

create table if not exists cbt_private.doubts (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references cbt_private.students(id) on delete cascade,
  test_id     uuid references cbt_private.tests(id) on delete set null,
  series_id   uuid references cbt_private.series(id) on delete set null,
  test_title  text not null default '' check (length(test_title) <= 300),
  qidx        int  not null default 0 check (qidx between 0 and 9999),
  qtext       text not null default '' check (length(qtext) <= 400),
  subject     text not null default '' check (length(subject) <= 40),
  body        text not null check (length(body) between 1 and 1200),
  answer      text not null default '' check (length(answer) <= 3500),
  status      text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at  timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists doubts_student on cbt_private.doubts (student_id, created_at desc);
create index if not exists doubts_status  on cbt_private.doubts (status, created_at desc);
alter table cbt_private.doubts enable row level security;
revoke all on cbt_private.doubts from public, anon, authenticated;

-- text typed by a student or a teacher: no markup characters, no control characters, trimmed
create or replace function cbt_private.doubt_txt(p text, p_max int) returns text language sql immutable as $$
  select left(btrim(regexp_replace(coalesce(p, ''), '[<>\\\x01-\x08\x0b\x0c\x0e-\x1f]', '', 'g')), p_max)
$$;
revoke all on function cbt_private.doubt_txt(text, int) from public, anon, authenticated;

-- ---------- student: ask a doubt on question p_qidx (0 = first) of a test taken ----------
create or replace function public.cbt_doubt_ask(p_mobile text, p_code text, p_device text, p_test text, p_qidx int, p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; v_sid uuid; v_tid uuid; x cbt_private.tests%rowtype; v_id uuid; v_q jsonb;
        v_body text := cbt_private.doubt_txt(p_body, 1200);
        v_sub  text := cbt_private.doubt_txt(p_subject, 40);
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_sid := (a->>'id')::uuid;
  if length(v_body) < 5 then return jsonb_build_object('ok', false, 'error', 'short'); end if;
  begin v_tid := p_test::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'test'); end;
  select * into x from cbt_private.tests where id = v_tid;
  if not found then return jsonb_build_object('ok', false, 'error', 'test'); end if;
  if not exists (select 1 from cbt_private.results where student_id = v_sid and test_id = v_tid) then
    return jsonb_build_object('ok', false, 'error', 'not_taken');
  end if;
  if cbt_private.res_hidden(v_tid) then return jsonb_build_object('ok', false, 'error', 'hidden'); end if;
  if p_qidx is null or p_qidx < 0 or p_qidx >= jsonb_array_length(x.data) then
    return jsonb_build_object('ok', false, 'error', 'question');
  end if;
  if (select count(*) from cbt_private.doubts where student_id = v_sid and created_at > now() - interval '1 day') >= 30
     or not cbt_private.rate_ok(v_sid, 'doubt', 20) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;
  if (select count(*) from cbt_private.doubts where student_id = v_sid and test_id = v_tid and qidx = p_qidx and status = 'open') >= 3 then
    return jsonb_build_object('ok', false, 'error', 'waiting');
  end if;
  v_q := x.data->p_qidx;
  if v_sub = '' then v_sub := cbt_private.doubt_txt(v_q->>'sec', 40); end if;
  insert into cbt_private.doubts (student_id, test_id, series_id, test_title, qidx, qtext, subject, body)
  values (v_sid, v_tid, x.series_id, left(x.title, 300), p_qidx, cbt_private.doubt_txt(v_q->>'q', 400), v_sub, v_body)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.cbt_doubt_ask(text, text, text, text, int, text, text) from public;
grant execute on function public.cbt_doubt_ask(text, text, text, text, int, text, text) to anon, authenticated;

-- ---------- student: my doubts (newest first, at most 200) ----------
create or replace function public.cbt_doubts_list(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; v_sid uuid;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_sid := (a->>'id')::uuid;
  return jsonb_build_object('ok', true, 'v87', true, 'items', coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'test_id', d.test_id, 'series_id', d.series_id, 'test', d.test_title,
             'qidx', d.qidx, 'q', d.qtext, 'subject', d.subject, 'body', d.body, 'answer', d.answer, 'status', d.status,
             'at', (extract(epoch from d.created_at) * 1000)::bigint,
             'ans_at', (extract(epoch from d.answered_at) * 1000)::bigint) order by d.created_at desc)
      from (select * from cbt_private.doubts where student_id = v_sid order by created_at desc limit 200) d), '[]'::jsonb));
end $$;
revoke all on function public.cbt_doubts_list(text, text, text) from public;
grant execute on function public.cbt_doubts_list(text, text, text) to anon, authenticated;

-- ---------- student: take back a doubt that has not been answered yet ----------
create or replace function public.cbt_doubt_del(p_mobile text, p_code text, p_device text, p_id text)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; v_sid uuid; v_id uuid;
begin
  a := cbt_private.auth(p_mobile, p_code, p_device);
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_sid := (a->>'id')::uuid;
  begin v_id := p_id::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'not_found'); end;
  delete from cbt_private.doubts where id = v_id and student_id = v_sid and status = 'open';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.cbt_doubt_del(text, text, text, text) from public;
grant execute on function public.cbt_doubt_del(text, text, text, text) to anon, authenticated;

-- ---------- admin: get {status?, series_id?} | answer {id, answer} | close {id} | delete {id} ----------
create or replace function public.cbt_admin_doubts(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_id uuid; v_ans text; v_t text;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'v87', true,
      'waiting', (select count(*) from doubts where status = 'open'),
      'items', coalesce((select jsonb_agg(z.j order by z.o, z.t desc) from (
          select jsonb_build_object('id', x.id, 'student', coalesce(s.name, ''), 'mobile', coalesce(s.mobile, ''),
                   'test_id', x.test_id, 'series_id', x.series_id, 'test', x.test_title, 'qidx', x.qidx, 'q', x.qtext,
                   'subject', x.subject, 'body', x.body, 'answer', x.answer, 'status', x.status,
                   'at', (extract(epoch from x.created_at) * 1000)::bigint,
                   'ans_at', (extract(epoch from x.answered_at) * 1000)::bigint) j,
                 case when x.status = 'open' then 0 else 1 end o, x.created_at t
            from doubts x left join students s on s.id = x.student_id
           where (coalesce(d->>'status', '') = '' or x.status = d->>'status')
             and (coalesce(d->>'series_id', '') = '' or x.series_id::text = d->>'series_id')
           order by case when x.status = 'open' then 0 else 1 end, x.created_at desc limit 300) z), '[]'::jsonb));
  end if;
  begin v_id := (d->>'id')::uuid; exception when others then return jsonb_build_object('ok', false, 'error', 'not_found'); end;
  if p_action = 'answer' then
    v_ans := cbt_private.doubt_txt(d->>'answer', 3500);
    if length(v_ans) < 2 then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
    update doubts set answer = v_ans, status = 'answered', answered_at = now() where id = v_id returning test_title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  elsif p_action = 'close' then
    update doubts set status = 'closed', answered_at = coalesce(answered_at, now()) where id = v_id returning test_title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  elsif p_action = 'delete' then
    delete from doubts where id = v_id returning test_title into v_t;
    if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
    perform set_config('cbt.detail', left(coalesce(v_t, ''), 120), true);
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_doubts(text, text, jsonb) from public;
grant execute on function public.cbt_admin_doubts(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
