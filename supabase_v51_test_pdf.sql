-- =====================================================================
--  v51: PDF notes link per test (Google Drive)
--
--  • Admin → Test studio → a test's ⋯ menu → "PDF notes link": paste a Google Drive / Google Docs link.
--  • Students see a "PDF" button next to that test, and the link in Library → Notes & PDFs.
--    The link opens Google Drive directly (share the file as "Anyone with the link → Viewer").
--  • Only https://drive.google.com/… and https://docs.google.com/… links are accepted.
--  • A student gets links only for tests they can open (not locked), checked through cbt_catalog.
--  • Setting links needs the OWNER password/session (team members get "forbidden").
--
--  Run in Supabase → SQL Editor. Safe to run again. Nothing else changes.
-- =====================================================================

create table if not exists cbt_private.test_pdfs (
  test_id    text primary key,
  url        text not null,
  label      text not null default '',
  updated_at timestamptz not null default now()
);
alter table cbt_private.test_pdfs enable row level security;
revoke all on cbt_private.test_pdfs from public, anon, authenticated;

-- actions: get | set {id, url, label} | remove {id}
create or replace function public.cbt_admin_test_pdf(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  a jsonb; d jsonb := coalesce(p_data, '{}'::jsonb);
  v_id text := btrim(coalesce(d->>'id', ''));
  v_url text := btrim(coalesce(d->>'url', ''));
  v_label text := left(btrim(coalesce(d->>'label', '')), 80);
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    delete from test_pdfs p where not exists (select 1 from tests t where t.id::text = p.test_id);
    return jsonb_build_object('ok', true, 'items', coalesce((select jsonb_object_agg(test_id,
      jsonb_build_object('url', url, 'label', label)) from test_pdfs), '{}'::jsonb));
  end if;

  if not exists (select 1 from tests t where t.id::text = v_id) then
    return jsonb_build_object('ok', false, 'error', 'test');
  end if;

  if p_action = 'set' then
    if length(v_url) > 500 or v_url !~ '^https://(drive|docs)\.google\.com/[A-Za-z0-9/_?=&%.#~+-]+$' then
      return jsonb_build_object('ok', false, 'error', 'url');
    end if;
    insert into test_pdfs (test_id, url, label) values (v_id, v_url, v_label)
    on conflict (test_id) do update set url = excluded.url, label = excluded.label, updated_at = now();
    return jsonb_build_object('ok', true);
  elsif p_action = 'remove' then
    delete from test_pdfs where test_id = v_id;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
grant execute on function public.cbt_admin_test_pdf(text, text, jsonb) to anon, authenticated;

-- student: links of the tests this student can open
create or replace function public.cbt_test_pdfs(p_mobile text, p_code text, p_device text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb;
begin
  c := (public.cbt_catalog(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((c->>'ok')::boolean, false) is not true then return c; end if;
  return jsonb_build_object('ok', true, 'items', coalesce((
    select jsonb_object_agg(p.test_id, jsonb_build_object('url', p.url, 'label', p.label))
      from cbt_private.test_pdfs p
      join jsonb_array_elements(coalesce(c->'tests', '[]'::jsonb)) x on x.value->>'id' = p.test_id
     where coalesce((x.value->>'locked')::boolean, false) is not true), '{}'::jsonb));
end $$;
grant execute on function public.cbt_test_pdfs(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
