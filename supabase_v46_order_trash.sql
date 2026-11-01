-- =====================================================================
--  v46: A deleted store order is kept in a private trash table
--  Admin → Orders → 🗑 (v44) removes an order for good from the panel. Before it goes, a full copy (code, name,
--  mobile, amount, payer, UTR, status, promotion, dates) and who deleted it are saved in cbt_private.order_trash,
--  so a deleted (even approved/paid) order can always be checked or brought back. Nobody can read this table from
--  the website; only the owner, from Supabase → SQL Editor:
--    see:      select at, who, code, data->>'name' name, data->>'mobile' mobile, data->>'amount' amount, data->>'status' status
--                from cbt_private.order_trash order by at desc;
--    restore:  insert into public.cbt_store_orders
--                select * from jsonb_populate_record(null::public.cbt_store_orders,
--                  (select data from cbt_private.order_trash where code = 'ASP-XXXXX' order by id desc limit 1));
--  Run after v44 (any order). Safe to run again.
-- =====================================================================

create table if not exists cbt_private.order_trash (
  id    bigserial primary key,
  code  text not null,
  data  jsonb not null,                       -- the whole order row as it was
  who   text not null default '',             -- the admin / team member who deleted it
  at    timestamptz not null default now()
);
create index if not exists order_trash_code on cbt_private.order_trash (code, at desc);
alter table cbt_private.order_trash enable row level security;
revoke all on cbt_private.order_trash from public, anon, authenticated;

create or replace function cbt_private.order_trash_keep() returns trigger
language plpgsql security definer set search_path = cbt_private, public, pg_temp as $$
begin
  insert into cbt_private.order_trash (code, data, who)
  values (old.code, to_jsonb(old), coalesce(nullif(current_setting('cbt.who', true), ''), current_user::text));
  return old;
end $$;
revoke all on function cbt_private.order_trash_keep() from public, anon, authenticated;

drop trigger if exists cbt_store_orders_trash on public.cbt_store_orders;
create trigger cbt_store_orders_trash before delete on public.cbt_store_orders
  for each row execute function cbt_private.order_trash_keep();

select 'v46 installed: deleted store orders are kept in cbt_private.order_trash' as status;
