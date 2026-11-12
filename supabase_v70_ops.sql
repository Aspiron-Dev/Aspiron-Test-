-- =====================================================================
-- v70: Storage and Costs (admin → Content & storage → Storage, Costs & integrations → Billing & costs)
-- Run in Supabase → SQL Editor, then run supabase_v35_admin_team.sql again (it wraps and logs the new function).
--
-- cbt_admin_ops(p_pw, p_action, p_data) — OWNER ONLY (team members are refused on the server):
--   'storage'    → database size, the biggest tables, Supabase Storage files by bucket / type, the largest files,
--                  and one size snapshot per day (so the panel can show growth). Read only.
--   'costs'      → monthly budgets + manual bills/invoices (entered by the owner, marked "manual").
--   'budget_set' → {service, amount}   (amount 0 or empty = no budget)            · logged in the activity log
--   'cost_add'   → {service, month 'YYYY-MM', amount, currency, kind 'bill'|'estimate', note, due_ms, paid}
--   'cost_paid'  → {id, paid}  · 'cost_delete' → {id}                            · logged in the activity log
-- Nothing here calls a provider or costs money. Provider usage that the database cannot see (bandwidth, Actions
-- minutes …) is shown as "Not available from provider" in the panel.
-- =====================================================================
create table if not exists cbt_private.ops_costs (
  id bigint generated always as identity primary key,
  service text not null check (length(service) between 1 and 40),
  month text not null check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  amount numeric(12,2) not null check (amount >= 0 and amount < 10000000),
  currency text not null default 'INR' check (currency in ('INR', 'USD')),
  kind text not null default 'bill' check (kind in ('bill', 'estimate')),
  note text not null default '' check (length(note) <= 200),
  due_ms bigint,
  paid boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text not null default ''
);
create table if not exists cbt_private.ops_snap (
  day date primary key,
  db_bytes bigint not null,
  file_bytes bigint not null default 0
);
alter table cbt_private.ops_costs enable row level security;
alter table cbt_private.ops_snap enable row level security;
revoke all on cbt_private.ops_costs, cbt_private.ops_snap from public, anon, authenticated;

create or replace function public.cbt_admin_ops(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare
  e text; d jsonb := coalesce(p_data, '{}'::jsonb); v_db bigint; v_files bigint := 0; v_tables jsonb; v_buckets jsonb := '[]';
  v_types jsonb := '[]'; v_big jsonb := '[]'; v_has_storage boolean; v_b jsonb; v_svc text; v_amt numeric; v_id bigint;
begin
  e := admin_ok(p_pw);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  -- owner only (also refused by admin_need for team members once v35 is run again)
  if nullif(current_setting('cbt.uid', true), '') is not null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_action = 'storage' then
    v_db := pg_database_size(current_database());
    select coalesce(jsonb_agg(t order by (t->>'bytes')::bigint desc), '[]') into v_tables from (
      select jsonb_build_object('schema', n.nspname, 'table', c.relname, 'bytes', pg_total_relation_size(c.oid),
                                'rows', greatest(c.reltuples, 0)::bigint) t
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname in ('public', 'cbt_private')
       order by pg_total_relation_size(c.oid) desc limit 15) x;
    v_has_storage := to_regclass('storage.objects') is not null;
    if v_has_storage then
      execute $q$
        with o as (select bucket_id, name, created_at, coalesce((metadata->>'size')::bigint, 0) sz, lower(coalesce(metadata->>'mimetype', '')) mt
                     from storage.objects)
        select (select coalesce(sum(sz), 0) from o),
               (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'files', n, 'bytes', b) order by b desc), '[]')
                  from (select bucket_id, count(*) n, sum(sz) b from o group by 1) x),
               (select coalesce(jsonb_agg(jsonb_build_object('type', k, 'files', n, 'bytes', b) order by b desc), '[]')
                  from (select case when mt = 'application/pdf' then 'PDFs' when mt like 'image/%' then 'Images'
                                    when mt like 'video/%' then 'Videos' when name ~* '\.(sql|dump|gz|zip)$' then 'Backups'
                                    else 'Other' end k, count(*) n, sum(sz) b from o group by 1) y),
               (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'name', left(name, 160), 'bytes', sz,
                                                              'at', (extract(epoch from created_at) * 1000)::bigint)), '[]')
                  from (select * from o order by sz desc limit 10) z)
      $q$ into v_files, v_buckets, v_types, v_big;
    end if;
    insert into ops_snap (day, db_bytes, file_bytes) values (current_date, v_db, v_files)
      on conflict (day) do update set db_bytes = excluded.db_bytes, file_bytes = excluded.file_bytes;
    delete from ops_snap where day < current_date - 400;
    return jsonb_build_object('ok', true, 'at', cbt_private.now_ms(), 'db_bytes', v_db, 'tables', v_tables,
      'storage', v_has_storage, 'file_bytes', v_files, 'buckets', v_buckets, 'types', v_types, 'largest', v_big,
      'history', (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'db', db_bytes, 'files', file_bytes) order by day), '[]')
                    from ops_snap where day >= current_date - 90));

  elsif p_action = 'costs' then
    return jsonb_build_object('ok', true,
      'budgets', coalesce((select value::jsonb from settings where key = 'ops_budget'), '{}'::jsonb),
      'costs', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'service', service, 'month', month, 'amount', amount,
                  'currency', currency, 'kind', kind, 'note', note, 'due_ms', due_ms, 'paid', paid, 'by', created_by,
                  'at', (extract(epoch from created_at) * 1000)::bigint) order by month desc, id desc), '[]')
                  from ops_costs where month >= to_char(now() - interval '24 months', 'YYYY-MM')));

  elsif p_action = 'budget_set' then
    v_svc := btrim(coalesce(d->>'service', ''));
    if v_svc !~ '^[A-Za-z0-9 ._&()/-]{1,40}$' then return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'service'); end if;
    v_amt := nullif(btrim(coalesce(d->>'amount', '')), '')::numeric;
    if v_amt is not null and (v_amt < 0 or v_amt >= 10000000) then return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'amount'); end if;
    v_b := coalesce((select value::jsonb from settings where key = 'ops_budget'), '{}'::jsonb);
    v_b := case when coalesce(v_amt, 0) = 0 then v_b - v_svc else v_b || jsonb_build_object(v_svc, v_amt) end;
    if (select count(*) from jsonb_object_keys(v_b)) > 40 then return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'too many'); end if;
    insert into settings values ('ops_budget', v_b::text) on conflict (key) do update set value = excluded.value;
    return jsonb_build_object('ok', true, 'budgets', v_b);

  elsif p_action = 'cost_add' then
    begin
      insert into ops_costs (service, month, amount, currency, kind, note, due_ms, paid, created_by)
      values (btrim(d->>'service'), d->>'month', (d->>'amount')::numeric, coalesce(nullif(d->>'currency', ''), 'INR'),
              coalesce(nullif(d->>'kind', ''), 'bill'), left(btrim(coalesce(d->>'note', '')), 200),
              nullif(d->>'due_ms', '')::bigint, coalesce((d->>'paid')::boolean, false),
              coalesce(nullif(current_setting('cbt.who', true), ''), 'Owner'))
      returning id into v_id;
    exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'check the service, month and amount');
    end;
    if (select count(*) from ops_costs) > 5000 then delete from ops_costs where id = v_id; return jsonb_build_object('ok', false, 'error', 'bad_request', 'detail', 'too many'); end if;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'cost_paid' then
    update ops_costs set paid = coalesce((d->>'paid')::boolean, true) where id = (d->>'id')::bigint;
    return jsonb_build_object('ok', found);

  elsif p_action = 'cost_delete' then
    delete from ops_costs where id = (d->>'id')::bigint;
    return jsonb_build_object('ok', found);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_ops(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_ops(text, text, jsonb) to anon;

-- Bug fix: Admin → PYQ bank → Papers always failed ("column reference n is ambiguous": a variable and a column
-- were both called n). The column wins now; nothing else in the function changes.
do $$ begin
  if to_regprocedure('cbt_private.cbt_admin_pyq__core(text,text,jsonb)') is not null then
    alter function cbt_private.cbt_admin_pyq__core(text, text, jsonb) set plpgsql.variable_conflict = use_column;
  elsif to_regprocedure('public.cbt_admin_pyq(text,text,jsonb)') is not null then
    alter function public.cbt_admin_pyq(text, text, jsonb) set plpgsql.variable_conflict = use_column;
  end if;
end $$;

notify pgrst, 'reload schema';
select 'v70 installed — now run supabase_v35_admin_team.sql again' as status;
