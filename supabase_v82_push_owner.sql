-- =====================================================================
--  v82: a phone's notifications can only be changed by that student or that phone (finding V2 of the input-validation review)
--  Before: a signed-in student who knew another phone's push link could turn its notifications off, or move them to
--  their own number (with their own keys, so the other phone got nothing). Now cbt_push_save acts on a saved link only
--  when it belongs to the student who is signed in, or the request carries that link's secret key (only the phone that
--  made the link has it; the app always sends it). This is the same check cbt_push_rotate has since v76.
--   * turning off: someone else's link is left as it is (the answer is still "ok", so it tells nothing)
--   * turning on: someone else's link is not moved; the answer is "taken"
--  Same phone, other student (sign out, then another student signs in on it): the phone has the same secret key, so the
--  link moves to the new student as before. No app change.
--  Run after v81. Safe to run again.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cbt_push_save(p_mobile text, p_code text, p_device text, p_sub jsonb DEFAULT NULL::jsonb, p_on boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare a jsonb; v_ep text; v_on boolean := coalesce(p_on, true);
        v_m text := cbt_private.norm_mobile(p_mobile);
        v_auth text := left(coalesce(p_sub#>>'{keys,auth}', ''), 100);
begin
  a := (public.cbt_notice(p_mobile => p_mobile, p_code => p_code, p_device => p_device))::text::jsonb;
  if coalesce((a->>'ok')::boolean, false) is not true then return a; end if;
  v_ep := left(coalesce(p_sub->>'endpoint', ''), 1000);
  -- v45: only the real push services (Google, Mozilla, Apple, Microsoft): the server never posts to any other address
  if v_ep !~ '^https://' or (v_on and v_ep !~* '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/') then return jsonb_build_object('ok', false, 'error', 'sub'); end if;
  if not v_on then
    -- v82: only this student's own link, or a link whose secret key came with the request
    delete from public.cbt_push_subs s where s.endpoint = v_ep
       and (s.mobile = v_m
            or (v_auth <> '' and rtrim(translate(s.auth, '+/', '-_'), '=') = rtrim(translate(v_auth, '+/', '-_'), '=')));
    return jsonb_build_object('ok', true);
  end if;
  if coalesce(p_sub#>>'{keys,p256dh}', '') = '' or v_auth = '' then
    return jsonb_build_object('ok', false, 'error', 'sub');
  end if;
  insert into public.cbt_push_subs as s (endpoint, mobile, p256dh, auth)
  values (v_ep, v_m, left(p_sub#>>'{keys,p256dh}', 200), v_auth)
  on conflict (endpoint) do update set mobile = excluded.mobile, p256dh = excluded.p256dh, auth = excluded.auth, seen_at = now()
   -- v82: a link already saved moves only for its own student, or for the phone that has its secret key
   where s.mobile = excluded.mobile
      or rtrim(translate(s.auth, '+/', '-_'), '=') = rtrim(translate(excluded.auth, '+/', '-_'), '=');
  if not found then return jsonb_build_object('ok', false, 'error', 'taken'); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- check (should be true)
select pg_get_functiondef('public.cbt_push_save(text,text,text,jsonb,boolean)'::regprocedure) like '%v82: a link already saved%' as push_v82;
