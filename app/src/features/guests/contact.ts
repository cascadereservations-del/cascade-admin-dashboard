// One rule for "do we have a way to reach this guest": the guest's own phone/e-mail
// (direct bookings) or the saved profile contact number (e.g. Airbnb guests).
type Reach = { phone?: string | null; email?: string | null; contact_number?: string | null };
const has = (v?: string | null) => !!v?.trim();

export const hasContact = (r: Reach) => has(r.phone) || has(r.email) || has(r.contact_number);
export const isMissingDetails = (r: Reach & { id_on_file?: boolean | null }) => !r.id_on_file && !hasContact(r);
/** Contact column value: phone, then saved contact number, then e-mail. */
export const displayContact = (r: Reach): string | null => [r.phone, r.contact_number, r.email].find(has) ?? null;
