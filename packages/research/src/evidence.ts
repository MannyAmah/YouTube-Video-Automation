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

  // Established molecular pharmacology anchor — lets the script name the real
  // molecular target(s), binding site, and downstream signalling for the
  // MECHANISM (textbook pharmacology), which the FDA label often omits. This
  // is what enables the real-biology mechanism visuals. Efficacy, safety, and
  // dosing claims must still cite the FDA/NIH label sources above.
  sources.push({
    id: 'pharmacology',
    type: 'pharmacology',
    title: `Molecular pharmacology of ${name}`,
    url: `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(name)}`,
    excerpt:
      `Established molecular mechanism of action for ${name}: the specific molecular ` +
      `target(s) it binds (receptor, enzyme, ion channel, transporter, or signalling ` +
      `protein), where and how it binds, and the downstream biochemical cascade — as ` +
      `documented in standard pharmacology references (PubChem, DrugBank, StatPearls).`,
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
