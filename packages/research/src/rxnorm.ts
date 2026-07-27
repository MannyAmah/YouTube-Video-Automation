import { fetchJson } from './http';

const BASE = 'https://rxnav.nlm.nih.gov/REST';

interface RxcuiResponse {
  idGroup?: { rxnormId?: string[] };
}

interface PropertiesResponse {
  properties?: { rxcui: string; name: string; tty: string };
}

/**
 * Normalize a user-entered medication name to an RxNorm ingredient concept.
 * Returns the rxcui and canonical ingredient name.
 */
export async function normalizeMedication(
  query: string,
): Promise<{ rxcui: string; name: string }> {
  const url = `${BASE}/rxcui.json?name=${encodeURIComponent(query)}&search=1`;
  const data = await fetchJson<RxcuiResponse>(url);
  const ids = data.idGroup?.rxnormId ?? [];
  if (ids.length === 0) {
    throw new Error(`RxNorm could not resolve medication "${query}"`);
  }
  // Prefer the concept whose TTY is IN (ingredient).
  for (const id of ids) {
    const props = await fetchJson<PropertiesResponse>(`${BASE}/rxcui/${id}/properties.json`);
    if (props.properties?.tty === 'IN') {
      return { rxcui: props.properties.rxcui, name: props.properties.name };
    }
  }
  // Brand or product concept (e.g. "Glucophage") — resolve its ingredient.
  for (const id of ids) {
    const related = await fetchJson<RelatedResponse>(`${BASE}/rxcui/${id}/related.json?tty=IN`);
    const ingredient = related.relatedGroup?.conceptGroup
      ?.flatMap((g) => g.conceptProperties ?? [])
      .find((c) => c.tty === 'IN');
    if (ingredient) return { rxcui: ingredient.rxcui, name: ingredient.name };
  }
  const first = await fetchJson<PropertiesResponse>(`${BASE}/rxcui/${ids[0]}/properties.json`);
  if (!first.properties) throw new Error(`RxNorm has no properties for rxcui ${ids[0]}`);
  return { rxcui: first.properties.rxcui, name: first.properties.name };
}

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: { conceptProperties?: { rxcui: string; name: string; tty: string }[] }[];
  };
}

export function rxnormUrl(rxcui: string): string {
  return `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/properties.json`;
}
