import type { ContextSource } from "./types";

type KnowledgeRecord = {
  id: string;
  title: string;
  content: string;
  updatedAt?: Date;
  emailAccountId?: string;
};

/** A model can select an existing source and quote it; it cannot create one. */
export function resolveKnowledgeSources({
  emailAccountId,
  knowledge,
  citations,
}: {
  emailAccountId: string;
  knowledge: KnowledgeRecord[];
  citations: { knowledgeId: string; quote: string }[];
}): ContextSource[] {
  const records = new Map(knowledge.map((record) => [record.id, record]));
  const seen = new Set<string>();
  const sources: ContextSource[] = [];
  for (const citation of citations) {
    const record = records.get(citation.knowledgeId);
    const quote = citation.quote.trim();
    if (!record || !quote || quote.length > 4000) continue;
    if (record.emailAccountId && record.emailAccountId !== emailAccountId)
      continue;
    if (!normalize(record.content).includes(normalize(quote))) continue;
    const key = `${record.id}:${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      id: `knowledge:${record.id}:${sources.length + 1}`,
      type: "knowledge",
      recordId: record.id,
      emailAccountId,
      title: record.title,
      excerpt: quote,
      observedAt: record.updatedAt?.toISOString() ?? new Date().toISOString(),
      href: `/${encodeURIComponent(emailAccountId)}/automation?tab=settings&knowledge-id=${encodeURIComponent(record.id)}`,
    });
    if (sources.length >= 10) break;
  }
  return sources;
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function formatKnowledgeSources(sources: ContextSource[]) {
  return sources
    .map((source) => `[${source.id}] ${source.title}\n${source.excerpt}`)
    .join("\n\n");
}

/** Cached records are always filtered against the currently authorized account. */
export function sourcesForAccount(
  sources: ContextSource[],
  emailAccountId: string,
) {
  return sources.filter((source) => source.emailAccountId === emailAccountId);
}
