import {
  locateQuote,
  passesHardFilters,
  rankByRelevance,
  type DiscoveryCandidate,
  type DiscoveryCriteria,
} from '@capability-hub/application';
import type { DiscoveryCard, DiscoveryPick } from '@capability-hub/hub-agents';
import { secretFindings } from '@capability-hub/infrastructure/content/secret-detection';

// 结构化输出说明与请求封装不在输入里，按总上限预留。
const requestReserve = 8 * 1024;

/** 本轮送模的卡片与引用号到固定版本的映射；`complete` 表示可送的可见发布全部在内。 */
interface CatalogCards {
  cards: DiscoveryCard[];
  refs: Map<string, DiscoveryCandidate>;
  complete: boolean;
}

function clip(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/** 输入作为字符串嵌进请求体时引号会被转义，按二次编码后的字节计。 */
export function encodedBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(JSON.stringify(value)));
}

/** 卡片可用的字节数：请求总上限扣除指令、其余输入与固定预留。 */
export function cardBudget(maxRequestBytes: number, instructions: string, input: object) {
  return maxRequestBytes - requestReserve - encodedBytes(instructions) - encodedBytes(input);
}

/**
 * 按字面相关度排好候选后逐张写成卡片，直到用完预算；命中明显凭据规则的发布不送模。
 * 引用号只在本轮有效，模型返回后服务端据此找回固定版本。
 */
export function catalogCards(
  candidates: DiscoveryCandidate[],
  focus: string,
  budget: number,
): CatalogCards {
  const cards: DiscoveryCard[] = [];
  const refs = new Map<string, DiscoveryCandidate>();
  let used = 0;
  for (const candidate of rankByRelevance(candidates, focus)) {
    const description = candidate.version.metadata.description;
    const scenarios = candidate.scenarios.map((scenario) => scenario.name);
    if (!secretFindings([description, ...candidate.tags, ...scenarios].join('\n')).next().done)
      continue;
    const card: DiscoveryCard = {
      ref: `r${cards.length + 1}`,
      slug: candidate.asset.slug,
      kind: candidate.asset.kind,
      category: candidate.release.category,
      scenarios: scenarios.slice(0, 4),
      tags: candidate.tags.slice(0, 8),
      description: clip(description, 200),
    };
    const size = encodedBytes(card) + 1;
    if (used + size > budget) return { cards, refs, complete: false };
    used += size;
    cards.push(card);
    refs.set(card.ref, candidate);
  }
  return { cards, refs, complete: true };
}

/** 前台与开场预检只接受本轮发出、复核后仍满足硬条件的固定版本；摘抄取核过的发布原文。 */
export function resolveDiscoveryPicks(
  picks: DiscoveryPick[],
  refs: Map<string, DiscoveryCandidate>,
  candidates: DiscoveryCandidate[],
  criteria: DiscoveryCriteria,
) {
  const current = new Map(candidates.map((candidate) => [candidate.version.id, candidate]));
  const seen = new Set<string>();
  return picks.flatMap((pick) => {
    const sent = refs.get(pick.ref);
    const candidate = sent && current.get(sent.version.id);
    if (
      !sent ||
      !candidate ||
      candidate.asset.id !== sent.asset.id ||
      candidate.resolvedReleaseId !== sent.resolvedReleaseId ||
      seen.has(candidate.asset.id) ||
      !passesHardFilters(candidate, criteria)
    )
      return [];
    seen.add(candidate.asset.id);
    const quote = pick.quote ? locateQuote(candidate, pick.quote) : null;
    return [
      {
        candidate,
        judgment: { fit: pick.fit, reason: pick.reason, quote: quote?.text ?? null },
        quoteField: quote?.field ?? null,
      },
    ];
  });
}
