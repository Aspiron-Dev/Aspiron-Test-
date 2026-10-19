-- =====================================================================
--  v29: Student payments — add the payments of students who joined before the store
--  (any amount, ₹0 for friends) from the admin panel. Store orders that you approved are counted
--  automatically; these rows are only the ones you add by hand. Only the admin panel (admin password)
--  can read or change them; students and the store page never see them.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again. Needs v13 (store).
-- =====================================================================

-- (paid_at comes from v20; added here too so this file works on its own)
alter table public.cbt_store_orders add column if not exists paid_at timestamptz;

create table if not exists public.cbt_payments (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  amount     int  not null check (amount between 0 and 1000000),
  paid_on    date not null default current_date,
  method     text not null default 'upi',          -- upi | cash | bank | free | other
  note       text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists cbt_payments_student on public.cbt_payments (student_id, paid_on desc);
alter table public.cbt_payments enable row level security;   -- no policies: only the function below can read/write
revoke all on public.cbt_payments from anon, authenticated;

create or replace function public.cbt_admin_payments(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
declare a jsonb; v_id uuid; v_st uuid; v_amt int; v_on date; v_m text; v_note text;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true,
      'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'student_id', p.student_id, 'name', s.name, 'mobile', s.mobile,
                    'amount', p.amount, 'paid_on', p.paid_on, 'method', p.method, 'note', p.note, 'created_at', p.created_at)
                    order by p.paid_on desc, p.created_at desc)
                  from public.cbt_payments p left join cbt_private.students s on s.id = p.student_id), '[]'::jsonb),
      -- every approved store order (not only the latest 300), so totals per student are complete
      'orders', coalesce((select jsonb_agg(jsonb_build_object('code', o.code, 'mobile', o.mobile, 'name', o.name, 'amount', o.amount,
                    'item_title', o.item_title, 'at', coalesce(o.paid_at, o.created_at)) order by o.created_at desc)
                  from public.cbt_store_orders o where o.status = 'paid'), '[]'::jsonb));
  end if;

  if p_action in ('add', 'update') then
    v_amt  := nullif(p_data->>'amount', '')::int;
    v_on   := coalesce(nullif(p_data->>'paid_on', '')::date, current_date);
    v_m    := coalesce(nullif(p_data->>'method', ''), 'upi');
    v_note := left(btrim(regexp_replace(coalesce(p_data->>'note', ''), '[<>\r\t]', '', 'g')), 300);
    if v_amt is null or v_amt < 0 or v_amt > 1000000 then return jsonb_build_object('ok', false, 'error', 'amount'); end if;
    if v_m not in ('upi', 'cash', 'bank', 'free', 'other') then return jsonb_build_object('ok', false, 'error', 'method'); end if;
    if v_on > current_date + 1 or v_on < date '2020-01-01' then return jsonb_build_object('ok', false, 'error', 'date'); end if;
  end if;

  if p_action = 'add' then
    v_st := nullif(p_data->>'student_id', '')::uuid;
    if v_st is null or not exists (select 1 from cbt_private.students where id = v_st) then
      return jsonb_build_object('ok', false, 'error', 'student');
    end if;
    insert into public.cbt_payments (student_id, amount, paid_on, method, note) values (v_st, v_amt, v_on, v_m, v_note)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'id', v_id);

  elsif p_action = 'update' then
    update public.cbt_payments set amount = v_amt, paid_on = v_on, method = v_m, note = v_note
     where id = nullif(p_data->>'id', '')::uuid;
    if not found then return jsonb_build_object('ok', false, 'error', 'payment'); end if;
    return jsonb_build_object('ok', true);

  elsif p_action = 'delete' then
    delete from public.cbt_payments where id = nullif(p_data->>'id', '')::uuid;
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'action');
end; $$;
grant execute on function public.cbt_admin_payments(text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
