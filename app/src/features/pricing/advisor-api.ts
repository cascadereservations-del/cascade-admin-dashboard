import { rpc } from '@/lib/rpc';
import { parseInputs, type AdvisorInputs } from './advisor';

// SPEC-35: one read-only call. price_advisor_inputs_v1 needs read_finance and changes nothing; the page does the arithmetic.
export async function fetchAdvisorInputs(propertyId: string, from: string, to: string): Promise<AdvisorInputs> {
  return parseInputs(await rpc<unknown>('price_advisor_inputs_v1', { p_property_id: propertyId, p_from: from, p_to: to }));
}
