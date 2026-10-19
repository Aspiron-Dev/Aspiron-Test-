-- =====================================================================
--  v28: Store — payment screenshot reaches the support DM with the message.
--  On "Verify your payment" the student uploads the screenshot; it is saved in the Storage bucket
--  "pay-shots" and its link is written in the Telegram / WhatsApp message, so one tap on Send
--  brings the message AND the screenshot to the support chat.
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run (after v13).  Safe to run again.
--  Without this file the store still works: the student is asked to attach the screenshot in the chat.
-- =====================================================================

-- public bucket (each link has a long random part, so nobody can guess another student's screenshot);
-- only small JPEGs (the page shrinks the photo before uploading)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pay-shots', 'pay-shots', true, 1572864, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- an upload is allowed only as  <order code>/<32 hex>.jpg  for an order made in the last 3 days, at most 5 per order
create or replace function public.cbt_store_shot_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select coalesce(p_name, '') ~ '^[A-Z0-9-]{4,20}/[0-9a-f]{32}\.jpg$'
    and exists (select 1 from public.cbt_store_orders o
                where o.code = split_part(p_name, '/', 1) and o.created_at > now() - interval '3 days')
    and (select count(*) from storage.objects
         where bucket_id = 'pay-shots' and name like split_part(p_name, '/', 1) || '/%') < 5;
$$;
grant execute on function public.cbt_store_shot_ok(text) to anon, authenticated;

drop policy if exists "pay-shots upload" on storage.objects;
create policy "pay-shots upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'pay-shots' and public.cbt_store_shot_ok(name));
