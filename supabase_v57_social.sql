-- =====================================================================
--  v57: Social media links, managed from Admin → Social media.
--
--  • Each platform (Instagram, Facebook, YouTube, X, Telegram, WhatsApp Channel, LinkedIn, Pinterest, Threads) has a
--    link and an On / Off switch. The website footer, the store, the Contact page and the student app's menu show only
--    the platforms that are On and have a link. Turn one Off and it disappears everywhere; nothing else changes.
--  • A link must be https:// and point to that platform's own site (an Instagram link must be on instagram.com, and so
--    on). The check runs here in the database too, so a wrong or harmful link can never reach the website.
--  • Who can change them: the owner, and team members with Broadcasts = Full access (view only = can look, not save).
--  • The three links in use today (Instagram, Telegram, WhatsApp Channel) are filled in and On the first time this runs.
--
--  Run ONCE in Supabase → SQL Editor (after v56). Safe to run again (it never overwrites links saved in the admin).
--  Then run supabase_v35_admin_team.sql again (team members can use Social media after that; the owner at once).
--  Until this runs, the website keeps showing the links written in config.js.
-- =====================================================================

create table if not exists cbt_private.social_links (
  platform   text primary key,
  url        text not null default '',
  shown      boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table cbt_private.social_links enable row level security;
revoke all on cbt_private.social_links from public, anon, authenticated;

-- The platforms the site knows (same keys as SOCIAL_PLATFORMS in config.js) and the sites their links may point to.
-- null = not a platform we know.
create or replace function cbt_private.social_hosts(p text) returns text[] language sql immutable as $$
  select case p
    when 'instagram'        then array['instagram.com']
    when 'facebook'         then array['facebook.com', 'fb.com', 'fb.me']
    when 'youtube'          then array['youtube.com', 'youtu.be']
    when 'x'                then array['x.com', 'twitter.com']
    when 'telegram'         then array['t.me', 'telegram.me']
    when 'whatsapp_channel' then array['whatsapp.com']
    when 'linkedin'         then array['linkedin.com']
    when 'pinterest'        then array['pinterest.com', 'pinterest.co.in', 'pin.it']
    when 'threads'          then array['threads.net', 'threads.com']
  end
$$;

-- '' (no link) is fine. Otherwise: https://, at most 300 characters, no spaces, quotes, angle brackets or backslashes,
-- and the site is the platform's own (or a subdomain of it, e.g. www. or m.). A user@host trick is refused.
create or replace function cbt_private.social_url_ok(p text, u text) returns boolean language sql immutable as $$
  select coalesce(u, '') = '' or (
    length(u) <= 300
    and u ~ '^https://[^\s"''<>\\]+$'
    and exists (select 1 from unnest(cbt_private.social_hosts(p)) h, lower(substring(u from '^https://([^/?#:@]+)(?:[/?#:]|$)')) host
                 where host = h or host like ('%.' || h)))
$$;
revoke all on function cbt_private.social_hosts(text), cbt_private.social_url_ok(text, text) from public, anon, authenticated;

-- the links in use today (only the first time: a link saved in the admin is never overwritten)
insert into cbt_private.social_links (platform, url, shown) values
  ('instagram',        'https://www.instagram.com/aspironeducation/',               true),
  ('telegram',         'https://t.me/AspironEducation',                             true),
  ('whatsapp_channel', 'https://whatsapp.com/channel/0029VbE8vNvBvvsddM1RDV0u',     true)
on conflict (platform) do nothing;

-- Public (website, store, contact page, student app): only the links that are On and pass the check
create or replace function public.cbt_social()
returns jsonb language sql security definer set search_path = cbt_private, pg_temp stable as $$
  select jsonb_build_object('ok', true, 'links', coalesce((
    select jsonb_agg(jsonb_build_object('platform', platform, 'url', url) order by platform)
      from social_links
     where shown and url <> '' and social_hosts(platform) is not null and social_url_ok(platform, url)), '[]'::jsonb));
$$;
-- the site calls with the public (anon) key; like every cbt_* function, not open to the authenticated role
revoke all on function public.cbt_social() from public, authenticated;
grant execute on function public.cbt_social() to anon;

-- Admin: 'get' (every platform saved so far) · 'save' {links:[{platform, url, shown}]}
-- 'save' checks every link first and saves nothing if one is wrong (error 'url' / 'url_needed' / 'platform' + which platform).
create or replace function public.cbt_admin_social(p_pw text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = cbt_private, pg_temp as $$
declare a jsonb; x jsonb; v_p text; v_u text; v_on boolean;
begin
  a := (public.cbt_admin(p_pw, 'ping', '{}'))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;

  if p_action = 'get' then
    return jsonb_build_object('ok', true, 'links', coalesce((
      select jsonb_agg(jsonb_build_object('platform', platform, 'url', url, 'shown', shown,
                                          'updated_at', floor(extract(epoch from updated_at) * 1000)::bigint) order by platform)
        from social_links where social_hosts(platform) is not null), '[]'::jsonb));
  end if;

  if p_action = 'save' then
    if jsonb_typeof(p_data->'links') is distinct from 'array' or jsonb_array_length(p_data->'links') > 20 then
      return jsonb_build_object('ok', false, 'error', 'data');
    end if;
    -- 1. check everything
    for x in select value from jsonb_array_elements(p_data->'links') loop
      if jsonb_typeof(x) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'data'); end if;
      v_p := coalesce(x->>'platform', ''); v_u := btrim(coalesce(x->>'url', '')); v_on := coalesce(x->>'shown', '') = 'true';
      if social_hosts(v_p) is null then return jsonb_build_object('ok', false, 'error', 'platform', 'platform', left(v_p, 40)); end if;
      if not social_url_ok(v_p, v_u) then return jsonb_build_object('ok', false, 'error', 'url', 'platform', v_p); end if;
      if v_on and v_u = '' then return jsonb_build_object('ok', false, 'error', 'url_needed', 'platform', v_p); end if;
    end loop;
    -- 2. save (updated_at moves only when something changed)
    for x in select value from jsonb_array_elements(p_data->'links') loop
      v_p := x->>'platform'; v_u := btrim(coalesce(x->>'url', '')); v_on := coalesce(x->>'shown', '') = 'true';
      insert into social_links as s (platform, url, shown, updated_at) values (v_p, v_u, v_on, now())
      on conflict (platform) do update set url = excluded.url, shown = excluded.shown, updated_at = now()
       where s.url is distinct from excluded.url or s.shown is distinct from excluded.shown;
    end loop;
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'action');
end $$;
revoke all on function public.cbt_admin_social(text, text, jsonb) from public, authenticated;
grant execute on function public.cbt_admin_social(text, text, jsonb) to anon;

notify pgrst, 'reload schema';
select 'v57 installed: social media links — now run supabase_v35_admin_team.sql again' as status;
