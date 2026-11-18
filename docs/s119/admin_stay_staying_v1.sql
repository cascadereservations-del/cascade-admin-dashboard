-- docs/s119/admin_stay_staying_v1.sql (lane A dependency, validate-only, NOT applied)
-- Read helper for the admin guest page "Who is staying, by booking". The s119 staying migration (20261119000000_s119_staying.sql)
-- revokes every grant on public.stay_staying, so the admin cannot read it directly and staff_home_v1 is a staff read.
-- Gate: manage_operations (owner/admin), the same as admin_calendar_events_v1. Names are NOT redacted: admins may see them (D-289 redacts for staff only).
-- Returns only stays that have a row. suggestion is the pending one only (a dismissed suggestion is not shown). Read-only.
-- Fold into the s119 SQL release (or a following one) before the admin lane ships; until the function exists the admin section hides itself.
create or replace function public.admin_stay_staying_v1(p_property uuid, p_uids text[])
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_property is null or not public.current_staff_authorized('manage_operations', p_property) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'stay_uid', s.stay_uid, 'names', s.names, 'source', s.source,
             'suggestion', case when s.suggestion_status = 'pending' then s.suggestion end,
             'version', s.version) order by s.stay_uid)
      from public.stay_staying s
     where s.property_id = p_property and s.stay_uid = any (coalesce(p_uids, '{}'::text[]))
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_stay_staying_v1(uuid, text[]) from public, anon, service_role;
grant execute on function public.admin_stay_staying_v1(uuid, text[]) to authenticated;
