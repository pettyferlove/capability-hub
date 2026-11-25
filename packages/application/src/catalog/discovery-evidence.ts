import type { AssetRecord, ReleaseRecord, VersionRecord } from '@capability-hub/domain/models';
import { hasHan, normalizeText, queryFillers, segmentTerms } from './search-terms.js';

/** 首页发现条件；与 HTTP 契约同形，`null` 表示不限。 */
export interface DiscoveryCriteria {
  keywords: string[];
  requirements: string[];
  kind: 'skill' | 'mcp' | null;
  category: 'general' | 'scenario' | 'uncategorized' | null;
  scenario_id: string | null;
  audience: 'readable' | 'public' | 'restricted';
  has_scripts: boolean | null;
  sort: 'relevance' | 'recent';
}

/** 一个固定版本及描述它的发布；当前版本取资产当前发布，历史版本取该版本最近一次发布。 */
export interface DiscoveryCandidate {
  asset: AssetRecord;
  version: VersionRecord;
  release: ReleaseRecord;
  /** 该版本最近一次发布；依据按它判断证据是否已变。 */
  resolvedReleaseId: string;
  scenarios: { id: string; name: string }[];
  tags: string[];
  publicReadable: boolean;
}

/** 能构成依据的发布字段；名称只说明召回位置，不算证明。 */
export type EvidenceField = 'tag' | 'scenario' | 'description';

/** 带 `requirement` 的依据证实了该必需项；其余只说明召回位置。 */
export interface EvidenceReason {
  field: 'name' | EvidenceField;
  text: string;
  requirement?: string;
}

/** 一个候选的得分、依据，以及尚未被发布信息证实的必需项。 */
export interface CandidateMatch {
  candidate: DiscoveryCandidate;
  score: number;
  reasons: EvidenceReason[];
  unverified: string[];
}

/** 从目录实际用途归纳出的可选方向，`patch` 只收窄到能查回代表版本的条件。 */
export interface DiscoveryUse {
  label: string;
  intent: string;
  patch: { requirements?: string[]; scenario_id?: string };
  representative: DiscoveryCandidate;
  field: EvidenceField;
}

/** 初始条件：不限类型、分类与场景，按相关性排序。 */
export const emptyCriteria: DiscoveryCriteria = {
  keywords: [],
  requirements: [],
  kind: null,
  category: null,
  scenario_id: null,
  audience: 'readable',
  has_scripts: null,
  sort: 'relevance',
};

// 必需项去掉不承载能力含义的泛化词后才逐词核对，否则「工具」「功能」会让发布原句永远对不上。
const evidenceFillers = new Set([
  ...queryFillers,
  ...'工具 资源 能力 功能 东西 方面 一些 什么 怎么 如何 怎样 进行 实现 提供 支持 能够 一套 问题 方法 方式 我们 自己'.split(
    ' ',
  ),
]);
const chineseNegations = [
  '不支持',
  '不包含',
  '不包括',
  '不提供',
  '不涉及',
  '不适用',
  '不覆盖',
  '不用于',
  '不含',
  '不能',
  '无法',
  '没有',
  '未提供',
  '未包含',
  '未覆盖',
  '并非',
  '不是',
  '不会',
  '暂不',
  '不做',
  '不处理',
];
const englishNegation =
  /(?<![\p{L}\p{N}])(?:not|no|without|cannot|can't|doesn't|don't|isn't|unsupported|excluding|except)(?![\p{L}\p{N}])/u;

const graphemes = new Intl.Segmenter('zh', { granularity: 'grapheme' });

/** 目录依据的长度上限；模型摘抄按码点计，原文范围按 UTF-16 计。 */
export const discoveryExcerptLimit = 120;

const oversizedQuote = new RegExp(`^.{${discoveryExcerptLimit + 1}}`, 'su');

function escapePattern(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 英文技术词两端不可接字母数字；数字还不能是点分版本的一部分，句末句点不受影响。 */
function termPattern(term: string) {
  const literal = escapePattern(term);
  if (hasHan(term)) return literal;
  const before = /^\p{N}/u.test(term) ? '(?<!\\p{N}\\.)' : '';
  const after = /\p{N}$/u.test(term) ? '(?!\\.\\p{N})' : '';
  return `(?<![\\p{L}\\p{N}])${before}${literal}${after}(?![\\p{L}\\p{N}])`;
}

/** NFKC 可能展开一个字符或合成多个字符，仅在完整字素的原文边界间取引用。 */
function sourceOffsets(text: string): (offset: number) => number | undefined {
  if (/^\p{ASCII}*$/u.test(text)) return (offset) => offset;
  const offsets = new Map([[0, 0]]);
  let end = 0;
  for (const { index, segment } of graphemes.segment(text)) {
    end += normalizeText(segment).length;
    offsets.set(end, index + segment.length);
  }
  return (offset) => offsets.get(offset);
}

function negated(clause: string) {
  return chineseNegations.some((marker) => clause.includes(marker)) || englishNegation.test(clause);
}

/** 词边界在完整原句上核对；截取后不能把未命中的单词后缀或版本片段变成新证据。 */
function excerpt(text: string, patterns: RegExp[]): string | undefined {
  const normalized = normalizeText(text);
  if (!patterns.every((pattern) => pattern.test(normalized))) return;
  if (text.length <= discoveryExcerptLimit) return text;
  const offset = sourceOffsets(text);
  const spans = patterns.flatMap((pattern, term) =>
    Array.from(normalized.matchAll(new RegExp(pattern, 'gu'))).flatMap((match) => {
      const start = offset(match.index);
      const end = offset(match.index + match[0].length);
      return start === undefined || end === undefined ? [] : [{ term, start, end }];
    }),
  );
  // 按命中末端前进；每个词最近一次命中的起点都在窗口内时，原文摘录才覆盖整项条件。
  const latest = patterns.map(() => -1);
  for (const { term, start, end } of spans.sort((a, b) => a.end - b.end)) {
    latest[term] = start;
    let from = Math.max(0, end - discoveryExcerptLimit);
    if (/[\uDC00-\uDFFF]/u.test(text.charAt(from))) from++;
    if (latest.some((index) => index < from)) continue;
    let to = from + discoveryExcerptLimit;
    if (/[\uD800-\uDBFF]/u.test(text.charAt(to - 1))) to--;
    return text.slice(from, to);
  }
}

/** 发布简介按句切分，点分版本内的点不算句末。 */
export function descriptionSentences(description: string) {
  return description
    .split(/(?<=[。！？!?；;])|\n+|(?<=\.)\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** 否定谓词管辖后面的列举，逗号本身不能把下一项变成肯定；另起肯定谓词才恢复。 */
function affirmativePassages(sentence: string) {
  const passages: string[] = [];
  let start = 0;
  let excluded = false;
  for (const match of sentence.matchAll(/[^,，]+/gu)) {
    const clause = normalizeText(match[0]);
    if (negated(clause)) {
      if (!excluded && match.index > start)
        passages.push(sentence.slice(start, match.index).replace(/[,，\s]+$/u, ''));
      excluded = true;
    } else if (
      excluded &&
      /^(?:但(?:是)?|however\b|but\b)?\s*(?:支持|适用|用于|提供|包含|覆盖|可以|supports?\b|provides?\b|includes?\b|allows?\b)/u.test(
        clause.trimStart(),
      )
    ) {
      start = match.index;
      excluded = false;
    }
  }
  if (!excluded) passages.push(sentence.slice(start));
  return passages;
}

/**
 * 只有同一标签、场景名或发布原句覆盖必需项的全部核对词才算证实；
 * 命中词所在小句含否定表述时不算，单个相关词或模型推断都不构成依据。
 */
export function proveRequirement(
  candidate: DiscoveryCandidate,
  requirement: string,
): EvidenceReason | null {
  const terms = segmentTerms(normalizeText(requirement), evidenceFillers);
  if (!terms.length) return null;
  const patterns = terms.map((term) => new RegExp(termPattern(term), 'u'));
  for (const [field, texts] of [
    ['tag', candidate.tags],
    ['scenario', candidate.scenarios.map((scenario) => scenario.name)],
    [
      'description',
      descriptionSentences(candidate.version.metadata.description).flatMap(affirmativePassages),
    ],
  ] as const) {
    for (const text of texts) {
      const proof = excerpt(text, patterns);
      if (proof) return { field, text: proof, requirement };
    }
  }
  return null;
}

/** 类型、分类、场景、受众与脚本都是硬条件，必须全部成立。 */
export function passesHardFilters(candidate: DiscoveryCandidate, criteria: DiscoveryCriteria) {
  if (criteria.kind && candidate.asset.kind !== criteria.kind) return false;
  if (criteria.category && candidate.release.category !== criteria.category) return false;
  if (
    criteria.scenario_id &&
    !candidate.scenarios.some((scenario) => scenario.id === criteria.scenario_id)
  )
    return false;
  if (criteria.audience === 'public' && !candidate.publicReadable) return false;
  if (criteria.audience === 'restricted' && candidate.publicReadable) return false;
  if (
    criteria.has_scripts !== null &&
    (candidate.version.metadata.has_scripts ?? false) !== criteria.has_scripts
  )
    return false;
  return true;
}

function recall(candidate: DiscoveryCandidate, keyword: string) {
  const term = normalizeText(keyword);
  const reasons: EvidenceReason[] = [];
  let score = 0;
  const slug = candidate.asset.slug;
  if (slug === term) score += 100;
  else if (slug.startsWith(term)) score += 40;
  else if (slug.includes(term)) score += 25;
  if (score) reasons.push({ field: 'name', text: slug });
  for (const tag of candidate.tags)
    if (normalizeText(tag).includes(term)) {
      score += 20;
      reasons.push({ field: 'tag', text: tag });
      break;
    }
  for (const scenario of candidate.scenarios)
    if (normalizeText(scenario.name).includes(term)) {
      score += 20;
      reasons.push({ field: 'scenario', text: scenario.name });
      break;
    }
  const patterns = [new RegExp(escapePattern(term), 'u')];
  for (const sentence of descriptionSentences(candidate.version.metadata.description)) {
    if (!normalizeText(sentence).includes(term)) continue;
    const hit = affirmativePassages(sentence)
      .map((passage) => excerpt(passage, patterns))
      .find((text) => text !== undefined);
    if (hit) {
      score += 10;
      reasons.push({ field: 'description', text: hit });
      break;
    }
  }
  return { score, reasons };
}

function sortMatches(matches: CandidateMatch[], sort: DiscoveryCriteria['sort']) {
  return matches.sort(
    (a, b) =>
      (sort === 'relevance' ? b.score - a.score : 0) ||
      b.candidate.release.published_at.localeCompare(a.candidate.release.published_at) ||
      a.candidate.asset.id.localeCompare(b.candidate.asset.id),
  );
}

/**
 * 有必需项时只有全部证实的候选计入 `verified`，只证实一部分的进入 `partial`，一项都没证实的不出现；
 * 没有必需项时召回词至少命中一处才计入，条件全空则按硬条件列出。
 */
export function matchCandidates(candidates: DiscoveryCandidate[], criteria: DiscoveryCriteria) {
  const verified: CandidateMatch[] = [];
  const partial: CandidateMatch[] = [];
  for (const candidate of candidates) {
    if (!passesHardFilters(candidate, criteria)) continue;
    const reasons: EvidenceReason[] = [];
    let score = 0;
    const unverified: string[] = [];
    for (const requirement of criteria.requirements) {
      const proof = proveRequirement(candidate, requirement);
      if (proof) {
        reasons.push(proof);
        score += 60;
      } else unverified.push(requirement);
    }
    let recalled = 0;
    for (const keyword of criteria.keywords) {
      const hit = recall(candidate, keyword);
      if (!hit.score) continue;
      recalled++;
      score += hit.score;
      for (const reason of hit.reasons)
        if (!reasons.some((item) => item.field === reason.field && item.text === reason.text))
          reasons.push(reason);
    }
    const match = { candidate, score, reasons, unverified };
    if (criteria.requirements.length) {
      if (!unverified.length) verified.push(match);
      else if (unverified.length < criteria.requirements.length) partial.push(match);
    } else if (!criteria.keywords.length || recalled) verified.push(match);
  }
  return {
    verified: sortMatches(verified, criteria.sort),
    partial: sortMatches(partial, criteria.sort),
  };
}

/**
 * 按字面相关度排列候选，供送模预算放不下全部可见发布时先放更可能相关的；
 * 只决定送哪些卡片，不决定是否推荐。
 */
export function rankByRelevance(candidates: DiscoveryCandidate[], text: string) {
  const terms = segmentTerms(normalizeText(text), evidenceFillers);
  return candidates
    .map((candidate) => ({
      candidate,
      score: terms.reduce((sum, term) => sum + recall(candidate, term).score, 0),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.candidate.release.published_at.localeCompare(a.candidate.release.published_at) ||
        a.candidate.asset.id.localeCompare(b.candidate.asset.id),
    )
    .map(({ candidate }) => candidate);
}

function compact(text: string) {
  return normalizeText(text).replace(/\s+/gu, ' ').trim();
}

/**
 * 模型摘抄的片段能否在该版本的标签、场景名或完整简介里逐字找到；只忽略全半角、大小写与空白差异，
 * 超长摘抄不参与核对，改写、省略号拼接或跨字段拼接也不算。
 */
export function locateQuote(
  candidate: DiscoveryCandidate,
  quote: string,
): { field: EvidenceField; text: string } | null {
  const trimmed = quote.trim();
  if (oversizedQuote.test(trimmed)) return null;
  const wanted = compact(trimmed);
  if ([...wanted].length < 2) return null;
  const units: [EvidenceField, string][] = [
    ...candidate.tags.map((tag): [EvidenceField, string] => ['tag', tag]),
    ...candidate.scenarios.map((scenario): [EvidenceField, string] => ['scenario', scenario.name]),
    ['description', candidate.version.metadata.description],
  ];
  const pattern = wanted.split(' ').map(escapePattern).join('\\s+');
  for (const [field, unit] of units) {
    const normalized = normalizeText(unit);
    let offset: ((index: number) => number | undefined) | undefined;
    for (const match of normalized.matchAll(new RegExp(pattern, 'gu'))) {
      offset ??= sourceOffsets(unit);
      const start = offset(match.index);
      const end = offset(match.index + match[0].length);
      if (start === undefined || end === undefined || end - start > discoveryExcerptLimit) continue;
      const raw = unit.slice(start, end);
      if (compact(raw) === wanted) return { field, text: raw };
    }
  }
  return null;
}

/** 方向补丁只追加必需项或收窄场景，不删除用户已确认的条件。 */
export function applyUsePatch(criteria: DiscoveryCriteria, patch: DiscoveryUse['patch']) {
  return {
    ...criteria,
    requirements: [...new Set([...criteria.requirements, ...(patch.requirements ?? [])])].slice(
      0,
      5,
    ),
    scenario_id: patch.scenario_id ?? criteria.scenario_id,
  };
}

function clip(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

function firstClause(description: string) {
  const sentence = descriptionSentences(description)[0] ?? '';
  const clause =
    sentence
      .split(/[，,；;：:]/u)[0]
      ?.replace(/[。！？!?.]+$/u, '')
      .trim() ?? '';
  return clause && !negated(normalizeText(clause)) ? clause : '';
}

/**
 * 从同一快照的实际用途归纳方向：优先与已知目标相关的候选，只要有相关用途就不拿无关资源凑数；
 * 一项都不相关时才从整个可见目录取有区别的用途作为探索。每项都由一个代表版本支持。
 */
export function catalogUses(
  candidates: DiscoveryCandidate[],
  focusText: string,
  activeScenarioIds: ReadonlySet<string>,
  selectedScenarioId: string | null,
  limit = 3,
): DiscoveryUse[] {
  const focus = segmentTerms(normalizeText(focusText), evidenceFillers)
    .filter((term) => term.length > 1 || !hasHan(term))
    .map((term) => new RegExp(termPattern(term), 'u'));
  const ranked = candidates
    .map((candidate) => {
      const text = normalizeText(
        [
          candidate.asset.slug,
          ...candidate.tags,
          ...candidate.scenarios.map((scenario) => scenario.name),
          candidate.version.metadata.description,
        ].join('\n'),
      );
      return {
        candidate,
        relevance: focus.filter((pattern) => pattern.test(text)).length,
      };
    })
    .sort(
      (a, b) =>
        b.relevance - a.relevance ||
        b.candidate.release.published_at.localeCompare(a.candidate.release.published_at) ||
        a.candidate.asset.id.localeCompare(b.candidate.asset.id),
    );
  const related = ranked.filter((entry) => entry.relevance > 0);
  const pool = related.length ? related : ranked;
  const uses: DiscoveryUse[] = [];
  const labels = new Set<string>();
  for (const { candidate } of pool) {
    if (uses.length >= limit) break;
    if (uses.some((use) => use.representative.asset.id === candidate.asset.id)) continue;
    const focusedTag = candidate.tags.find((tag) => {
      const text = normalizeText(tag);
      return focus.some((pattern) => pattern.test(text));
    });
    const clause = firstClause(candidate.version.metadata.description);
    const scenario = candidate.scenarios.find(
      ({ id }) => activeScenarioIds.has(id) && (!selectedScenarioId || id === selectedScenarioId),
    );
    const option: { label: string; field: EvidenceField; patch: DiscoveryUse['patch'] } | null =
      focusedTag
        ? { label: focusedTag, field: 'tag', patch: { requirements: [focusedTag] } }
        : scenario
          ? {
              label: scenario.name,
              field: 'scenario',
              patch: { scenario_id: scenario.id },
            }
          : clause
            ? {
                label: clause,
                field: 'description',
                patch: { requirements: [clip(clause, 64)] },
              }
            : candidate.tags[0]
              ? {
                  label: candidate.tags[0],
                  field: 'tag',
                  patch: { requirements: [candidate.tags[0]] },
                }
              : null;
    if (!option) continue;
    const key = normalizeText(option.label);
    if (labels.has(key)) continue;
    // 补丁必须能由代表版本独立证实，否则不展示该方向。
    if (
      option.patch.requirements &&
      !option.patch.requirements.every((requirement) => proveRequirement(candidate, requirement))
    )
      continue;
    labels.add(key);
    uses.push({
      label: clip(option.label, 28),
      intent: clip(
        descriptionSentences(candidate.version.metadata.description)[0] ?? candidate.asset.slug,
        200,
      ),
      patch: option.patch,
      representative: candidate,
      field: option.field,
    });
  }
  return uses;
}
