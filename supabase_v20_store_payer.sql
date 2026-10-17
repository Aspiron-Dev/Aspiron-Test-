-- =====================================================================
--  v20: Store — after paying, the student gives the name of the account they paid from and the UTR /
--  transaction ID. Shown to the admin with each order (repeated UTRs are flagged).
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13).  Safe to run again.
-- =====================================================================

alter table public.cbt_store_orders add column if not exists payer text not null default '';
alter table public.cbt_store_orders add column if not exists utr text not null default '';
alter table public.cbt_store_orders add column if not exists paid_at timestamptz;
create index if not exists cbt_store_orders_utr on public.cbt_store_orders (utr) where utr <> '';

-- Public: student says "I have paid" for their own order (code + same mobile), only while it is pending
create or replace function public.cbt_store_paid(p_code text, p_mobile text, p_payer text, p_utr text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.cbt_store_orders; v_m text := right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10);
        v_p text := left(btrim(regexp_replace(coalesce(p_payer, ''), '[<>"`\r\n\t]', '', 'g')), 60);
        v_u text := upper(left(regexp_replace(coalesce(p_utr, ''), '[^A-Za-z0-9]', '', 'g'), 30));
begin
  if length(v_p) < 2 then return jsonb_build_object('ok', false, 'error', 'payer'); end if;
  if v_u <> '' and length(v_u) < 6 then return jsonb_build_object('ok', false, 'error', 'utr'); end if;
  select * into o from public.cbt_store_orders where code = upper(btrim(coalesce(p_code, ''))) and mobile = v_m;
  if not found then return jsonb_build_object('ok', false, 'error', 'order'); end if;
  if o.status <> 'pending' then return jsonb_build_object('ok', true, 'status', o.status); end if;
  update public.cbt_store_orders set payer = v_p, utr = v_u, paid_at = now() where code = o.code;
  return jsonb_build_object('ok', true, 'status', 'pending',
    'utr_seen', v_u <> '' and exists (select 1 from public.cbt_store_orders where utr = v_u and code <> o.code));
end; $$;
grant execute on function public.cbt_store_paid(text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
