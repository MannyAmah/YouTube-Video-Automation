import { fetchJson } from './http';

/**
 * MedlinePlus Connect — NIH's patient-friendly drug information, keyed by
 * RxNorm code. This is the plain-language backbone for ELI5 narration.
 */

interface MlpEntry {
  title?: { _value?: string };
  link?: { href?: string; rel?: string }[];
  summary?: { _value?: string };
}

interface MlpResponse {
  feed?: { entry?: MlpEntry[] };
}

export interface MedlinePlusTopic {
  title: string;
  url: string;
  summaryText: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchMedlinePlus(rxcui: string): Promise<MedlinePlusTopic | null> {
  const url =
    'https://connect.medlineplus.gov/service?mainSearchCriteria.v.cs=2.16.840.1.113883.6.88' +
    `&mainSearchCriteria.v.c=${encodeURIComponent(rxcui)}&knowledgeResponseType=application/json`;
  const data = await fetchJson<MlpResponse>(url);
  const entries = data.feed?.entry ?? [];
  const first = entries[0];
  if (!first?.summary?._value) return null;
  const link = (first.link ?? []).find((l) => l.rel === 'alternate') ?? first.link?.[0];
  return {
    title: first.title?._value ?? 'MedlinePlus drug information',
    url: (link?.href ?? 'https://medlineplus.gov/').split('?')[0]!,
    summaryText: stripHtml(first.summary._value),
  };
}
