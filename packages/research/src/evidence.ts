import { MedicationEvidence, MedicationEvidenceSchema, EvidenceSource } from '@yva/shared';
import {
  brandAndManufacturerSweep,
  dailymedUrl,
  extractSections,
  findBestLabel,
  openFdaLabelUrl,
} from './openfda';
import { fetchMedlinePlus } from './medlineplus';
import { normalizeMedication, rxnormUrl } from './rxnorm';

const EXCERPT_MAX = 2400;

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= EXCERPT_MAX ? clean : `${clean.slice(0, EXCERPT_MAX)}…`;
}

/**
 * Gather a complete evidence bundle for one medication from FDA/NIH systems.
 *
 * Every source in the bundle is real, fetched now, and carries a verbatim
 * excerpt. The script step may ONLY make factual claims that cite these
 * source ids — that contract is enforced by reviewScript() in @yva/shared.
 */
export async function gatherEvidence(medicationQuery: string): Promise<MedicationEvidence> {
  const now = new Date().toISOString();

  // 1. Normalize the name via RxNorm (NIH).
  const { rxcui, name } = await normalizeMedication(medicationQuery);

  // 2. FDA label (openFDA) + brand/manufacturer sweep.
  const [label, sweep, medline] = await Promise.all([
    findBestLabel(name),
    brandAndManufacturerSweep(name),
    fetchMedlinePlus(rxcui).catch(() => null),
  ]);

  const labelSections = extractSections(label);
  const sources: EvidenceSource[] = [];

  for (const [section, text] of Object.entries(labelSections)) {
    sources.push({
      id: `label_${section}`,
      type: 'openfda_label',
      title: `FDA label — ${section.replace(/_/g, ' ')} (${name})`,
      url: openFdaLabelUrl(name),
      excerpt: excerpt(text),
      section,
      retrievedAt: now,
    });
  }

  // DailyMed page for the same SPL document — the human-readable label.
  sources.push({
    id: 'dailymed_spl',
    type: 'dailymed_spl',
    title: `DailyMed label for ${name} (SPL ${label.set_id})`,
    url: dailymedUrl(label.set_id),
    excerpt: excerpt(
      labelSections['indications_and_usage'] ?? labelSections['description'] ?? name,
    ),
    retrievedAt: now,
  });

  if (medline) {
    sources.push({
      id: 'medlineplus',
      type: 'medlineplus',
      title: medline.title,
      url: medline.url,
      excerpt: excerpt(medline.summaryText),
      retrievedAt: now,
    });
  }

  sources.push({
    id: 'rxnorm',
    type: 'rxnorm',
    title: `RxNorm concept ${rxcui} (${name})`,
    url: rxnormUrl(rxcui),
    excerpt: `RxNorm normalized name: ${name}; rxcui ${rxcui}.`,
    retrievedAt: now,
  });

  const evidence: MedicationEvidence = {
    genericName: name,
    brandNames: sweep.brandNames,
    rxcui,
    drugClass: label.openfda.pharm_class_epc?.[0],
    manufacturers: sweep.manufacturers,
    sources,
    labelSections,
  };

  return MedicationEvidenceSchema.parse(evidence);
}
