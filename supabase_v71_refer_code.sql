-- =====================================================================
-- v71: a clean referral code. Run once in Supabase → SQL Editor (nothing else to run after it).
-- Before: store?r=<first name><last 5 digits of the mobile>  (e.g. rahul44444: shows the name and half the number)
-- Now:    store?r=asp<5 random digits>                        (e.g. asp48213: no name, no part of the number)
-- Only codes made from now on change. A student who already has a link keeps it, so links already shared keep
-- working and no reward is lost. The shape still fits the old rule (letters + 5–7 digits), so the store, the app
-- and the table checks need no change.
-- =====================================================================
create or replace function cbt_private.refer_code_for(p_mobile text, p_name text, p_ip text) returns text
language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare v text; i int := 0;
begin
  select code into v from cbt_private.refer_codes where mobile = p_mobile;
  if v is not null then return v; end if;
  loop
    i := i + 1;
    if i > 60 then return null; end if;
    -- 5 digits; 6 and then 7 when many are taken. Never the student's own last digits.
    v := 'asp' || lpad(floor(random() * power(10, 5 + least(2, i / 20)))::bigint::text, 5 + least(2, i / 20), '0');
    exit when right(v, 5) <> right(p_mobile, 5) and not exists (select 1 from cbt_private.refer_codes where code = v);
  end loop;
  insert into cbt_private.refer_codes (mobile, code, name, ip) values (p_mobile, v, left(btrim(coalesce(p_name, '')), 60), coalesce(p_ip, ''))
    on conflict (mobile) do nothing;
  return (select code from cbt_private.refer_codes where mobile = p_mobile);
exception when unique_violation then
  return (select code from cbt_private.refer_codes where mobile = p_mobile);
end $$;
revoke all on function cbt_private.refer_code_for(text, text, text) from public, anon, authenticated;

select 'v71 installed: new referral codes look like asp48213' as status;
