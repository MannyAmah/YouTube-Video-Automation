import { fetchJson } from './http';

/** Subset of an openFDA drug label result we consume (verified 2026-07). */
export interface OpenFdaLabel {
  id: string;
  set_id: string;
  effective_time?: string;
  openfda: {
    generic_name?: string[];
    brand_name?: string[];
    manufacturer_name?: string[];
    pharm_class_epc?: string[];
    rxcui?: string[];
    route?: string[];
  };
  [section: string]: unknown;
}

interface OpenFdaResponse {
  results?: OpenFdaLabel[];
}

/** Label sections we extract as evidence, in narrative order. */
export const LABEL_SECTIONS = [
  'description',
  'indications_and_usage',
  'mechanism_of_action',
  'clinical_pharmacology',
  'dosage_and_administration',
  'contraindications',
  'boxed_warning',
  'warnings_and_cautions',
  'warnings',
  'adverse_reactions',
  'drug_interactions',
  'information_for_patients',
  'overdosage',
  'how_supplied',
] as const;

const BASE = 'https://api.fda.gov/drug/label.json';

function sectionText(label: OpenFdaLabel, section: string): string | null {
  const value = label[section];
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0) {
    return value.map((v) => String(v)).join('\n\n');
  }
  return null;
}

function isSingleIngredient(label: OpenFdaLabel, query: string): boolean {
  const generics = (label.openfda.generic_name ?? []).join(' AND ');
  if (!generics) return false;
  const parts = generics.split(/\s+AND\s+|,/i).map((p) => p.trim()).filter(Boolean);
  return (
    parts.length === 1 && parts[0]!.toLowerCase().includes(query.toLowerCase().split(' ')[0]!)
  );
}

function contentScore(label: OpenFdaLabel): number {
  let score = 0;
  for (const s of LABEL_SECTIONS) if (sectionText(label, s)) score++;
  return score;
}

/**
 * Find the best single-ingredient FDA label for a medication.
 * Prefers labels with the richest section coverage (mechanism_of_action etc.).
 */
export async function findBestLabel(genericName: string): Promise<OpenFdaLabel> {
  const q = encodeURIComponent(`"${genericName}"`);
  const url = `${BASE}?search=openfda.generic_name:${q}&limit=25`;
  const data = await fetchJson<OpenFdaResponse>(url);
  const results = data.results ?? [];
  if (results.length === 0) {
    throw new Error(`openFDA returned no drug labels for "${genericName}"`);
  }
  const singles = results.filter((r) => isSingleIngredient(r, genericName));
  const pool = singles.length > 0 ? singles : results;
  pool.sort((a, b) => contentScore(b) - contentScore(a));
  const best = pool[0]!;
  if (contentScore(best) < 4) {
    throw new Error(
      `openFDA label for "${genericName}" has too few usable sections (${contentScore(best)}).`,
    );
  }
  return best;
}

export function extractSections(label: OpenFdaLabel): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of LABEL_SECTIONS) {
    const text = sectionText(label, section);
    if (text) out[section] = text;
  }
  return out;
}

/** Aggregate brand names/manufacturers across labels for the same generic. */
export async function brandAndManufacturerSweep(
  genericName: string,
): Promise<{ brandNames: string[]; manufacturers: string[] }> {
  const q = encodeURIComponent(`"${genericName}"`);
  const url = `${BASE}?search=openfda.generic_name:${q}&limit=50`;
  try {
    const data = await fetchJson<OpenFdaResponse>(url);
    const brands = new Set<string>();
    const makers = new Set<string>();
    for (const r of data.results ?? []) {
      if (!isSingleIngredient(r, genericName)) continue;
      for (const b of r.openfda.brand_name ?? []) brands.add(titleCase(b));
      for (const m of r.openfda.manufacturer_name ?? []) makers.add(m);
    }
    return { brandNames: [...brands].slice(0, 8), manufacturers: [...makers].slice(0, 8) };
  } catch {
    return { brandNames: [], manufacturers: [] };
  }
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function dailymedUrl(setId: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`;
}

export function openFdaLabelUrl(genericName: string): string {
  return `https://api.fda.gov/drug/label.json?search=openfda.generic_name:${encodeURIComponent(`"${genericName}"`)}`;
}
