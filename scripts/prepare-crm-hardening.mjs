// Produce a reviewable migration from the exact checked-in backend baseline.
// This script never connects to a database or applies SQL.
import fs from 'node:fs/promises';
const base = new URL('../../stay-site/supabase/migrations/', import.meta.url);
const read = (name) => fs.readFile(new URL(name, base), 'utf8');
function replaceOnce(text, from, to) {
  if (text.split(from).length !== 2) throw new Error('Backend baseline changed; inspect the migration before regenerating.');
  // Use a function replacement so SQL literals containing `$'` or `$&` are
  // copied verbatim instead of being interpreted by JavaScript's replace API.
  return text.replace(from, () => to);
}
function functionSql(text, name) {
  const start = text.indexOf(`create or replace function public.${name}(`);
  const end = text.indexOf('\n$$;', start);
  if (start < 0 || end < 0) throw new Error('Backend function not found.');
  return text.slice(start, end + 4);
}
const baseline = (await read('20260913100000_admin_read_models_v1.sql')).replace(/\r\n/g, '\n');
let audit = functionSql((await read('20260914250000_admin_audit_feed_v2.sql')).replace(/\r\n/g, '\n'), 'admin_audit_feed_v1');
audit = replaceOnce(audit, 'v_staff boolean;', 'v_staff boolean; v_guest boolean;');
audit = replaceOnce(audit, "v_staff := public.current_staff_authorized('manage_staff', p_property_id);", "v_staff := public.current_staff_authorized('manage_staff', p_property_id);\n  v_guest := public.current_staff_authorized('manage_operations', p_property_id);");
audit = replaceOnce(audit, 'where g.property_id = p_property_id', 'where g.property_id = p_property_id and v_guest');
audit = replaceOnce(audit, 'where g2.property_id = p_property_id', 'where g2.property_id = p_property_id and v_guest');

let preview = functionSql(baseline, 'preview_guest_merge_v1');
preview = replaceOnce(preview, "  perform public.admin_require('manage_operations', v_prop);", `  perform public.admin_require('manage_operations', v_prop);
  -- Both records must be active and in the caller's same property before
  -- any SECURITY DEFINER read exposes source contacts or reservation counts.
  if not exists (select 1 from public.guests where id = p_surviving and is_active)
    or not exists (select 1 from public.guests where id = p_merged and is_active and property_id = v_prop)
  then raise exception using errcode = '42501', message = 'guest merge scope denied'; end if;`);
let merge = functionSql(baseline, 'merge_guests_v1');
merge = replaceOnce(merge, '  v_preview := public.preview_guest_merge_v1(p_surviving, p_merged);', `  -- Lock both records in a deterministic order; re-check scope and contact
  -- after the locks. A profile/companion must never disappear into an inactive guest.
  perform 1 from public.guests where id in (p_surviving, p_merged) order by id for update;
  v_preview := public.preview_guest_merge_v1(p_surviving, p_merged);
  if exists (select 1 from public.guest_profile_details where guest_id = p_merged)
    or exists (select 1 from public.guest_companions where guest_id = p_merged)
    or exists (select 1 from public.crm_guest_profiles where guest_id = p_merged)
  then raise exception using errcode = '22023', message = 'Review the source profile and companions before merging this guest'; end if;`);
merge = replaceOnce(merge, "  if found then return jsonb_build_object('ok', true, 'replayed', true, 'id', v_existing.id); end if;", `  if found then
    if v_existing.surviving_guest_id <> p_surviving or v_existing.merged_guest_id <> p_merged or v_existing.property_id <> v_prop then
      raise exception using errcode = '40001', message = 'idempotency conflict';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'id', v_existing.id);
  end if;`);

let profile = functionSql((await read('20260914220000_guest_profile_contact_and_id.sql')).replace(/\r\n/g, '\n'), 'save_guest_profile_v1');
profile = replaceOnce(profile, 'if p_expected_version is not null and v_row.version <> p_expected_version then', 'if (p_expected_version is null and v_row.version > 1) or (p_expected_version is not null and v_row.version <> p_expected_version) then');
profile = replaceOnce(profile, "  insert into public.guest_profile_details(guest_id, property_id) values (p_guest_id, v_prop) on conflict (guest_id) do nothing;", `  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception using errcode = '22023', message = 'profile change reason required';
  end if;
  if exists (select 1 from jsonb_each_text(p_patch) f where char_length(f.value) > 4000) then
    raise exception using errcode = '22023', message = 'profile field too long';
  end if;
  if coalesce(p_patch->>'birthday', '') <> '' and (p_patch->>'birthday')::date > current_date then
    raise exception using errcode = '22023', message = 'birthday cannot be in the future';
  end if;
  if coalesce(p_patch->>'id_drive_url', '') <> '' and (p_patch->>'id_drive_url') !~ '^https://drive[.]google[.]com/(file/d|drive/folders)/[A-Za-z0-9_-]+(/view)?/?([?][^[:space:]]*)?$' then
    raise exception using errcode = '22023', message = 'invalid Drive document link';
  end if;
  if coalesce(p_patch->>'messenger_link', '') <> '' and (p_patch->>'messenger_link') !~ '^https://(www[.])?(messenger[.]com|facebook[.]com|m[.]me)/|^https://business[.]facebook[.]com/' then
    raise exception using errcode = '22023', message = 'invalid Messenger link';
  end if;
  insert into public.guest_profile_details(guest_id, property_id) values (p_guest_id, v_prop) on conflict (guest_id) do nothing;`);

const storage = `-- Restrict new uploads without deleting or rewriting existing photo objects.
update storage.buckets set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'guest-id-photos';
drop policy if exists "guest id photos manage read" on storage.objects;
drop policy if exists "guest id photos manage write" on storage.objects;
drop policy if exists "guest id photos manage delete" on storage.objects;
create policy "guest id photos manage read" on storage.objects for select to authenticated using (
  bucket_id = 'guest-id-photos' and exists (
    select 1 from public.guest_companions c join public.guests g on g.id = c.guest_id
    where c.id::text = (storage.foldername(storage.objects.name))[1] and public.current_staff_authorized('manage_operations', g.property_id)
  )
);
create policy "guest id photos manage write" on storage.objects for insert to authenticated with check (
  bucket_id = 'guest-id-photos' and exists (
    select 1 from public.guest_companions c join public.guests g on g.id = c.guest_id
    where c.id::text = (storage.foldername(storage.objects.name))[1] and public.current_staff_authorized('manage_operations', g.property_id)
  )
);
create policy "guest id photos manage delete" on storage.objects for delete to authenticated using (
  bucket_id = 'guest-id-photos' and exists (
    select 1 from public.guest_companions c join public.guests g on g.id = c.guest_id
    where c.id::text = (storage.foldername(storage.objects.name))[1] and public.current_staff_authorized('manage_operations', g.property_id)
  )
);`;
const header = `-- DRAFT ONLY: not applied. Rehearse on an isolated Cascade database first.
-- Prerequisites: the 20260914 profile, companion and audit-feed releases.
-- Preserve a fresh verified backup of data, function definitions, grants,
-- policies and storage metadata. Never run against another project.
-- See ../UPGRADE-PLAN.md for acceptance and rollback gates.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
`;
const target = new URL('../docs/migrations/guest-crm-hardening.sql', import.meta.url);
await fs.mkdir(new URL('../docs/migrations/', import.meta.url), { recursive: true });
await fs.writeFile(target, `${header}\n${audit}\n\n${preview}\n\n${merge}\n\n${profile}\n\n${storage}\n\n-- Grants are restated so a fresh (no-ACL) restore rehearses the same surface production has.
revoke all on function public.admin_audit_feed_v1(uuid, integer) from public, anon, service_role;
grant execute on function public.admin_audit_feed_v1(uuid, integer) to authenticated;
revoke all on function public.preview_guest_merge_v1(uuid, uuid) from public, anon, service_role;
grant execute on function public.preview_guest_merge_v1(uuid, uuid) to authenticated;
revoke all on function public.merge_guests_v1(uuid, uuid, text, text) from public, anon, service_role;
grant execute on function public.merge_guests_v1(uuid, uuid, text, text) to authenticated;
revoke all on function public.save_guest_profile_v1(uuid, jsonb, integer, text) from public, anon, service_role;
grant execute on function public.save_guest_profile_v1(uuid, jsonb, integer, text) to authenticated;

commit;\n`);
console.log('Prepared one draft migration. No database connection or mutation.');
