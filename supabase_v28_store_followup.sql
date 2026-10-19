-- =====================================================================
--  v28: Store orders — follow-up tracking for the admin's Orders page
--  For every order: how many times the student was contacted (call / SMS / WhatsApp / Telegram),
--  when last, and a short note (e.g. "will pay tonight"). Only the admin panel (admin password) can
--  read or change these; the store page never sees them.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.  Safe to run again. Needs v13 (store).
-- =====================================================================

alter table public.cbt_store_orders add column if not exists contacted_at timestamptz;
alter table public.cbt_store_orders add column if not exists contact_n    int  not null default 0;
alter table public.cbt_store_orders add column if not exists note         text not null default '';

create or replace function public.cbt_admin_store_order(p_pw text, p_code text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a jsonb;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  if not exists (select 1 from public.cbt_store_orders where code = p_code) then
    return jsonb_build_object('ok', false, 'error', 'order');
  end if;

  if p_action = 'contacted' then
    update public.cbt_store_orders set contacted_at = now(), contact_n = contact_n + 1 where code = p_code;
  elsif p_action = 'note' then
    update public.cbt_store_orders
       set note = left(btrim(regexp_replace(coalesce(p_data->>'note', ''), '[<>\r\t]', '', 'g')), 500)
     where code = p_code;
  else
    return jsonb_build_object('ok', false, 'error', 'action');
  end if;
  return (select jsonb_build_object('ok', true, 'contacted_at', contacted_at, 'contact_n', contact_n, 'note', note)
            from public.cbt_store_orders where code = p_code);
end; $$;
grant execute on function public.cbt_admin_store_order(text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
