import {
  hubFeedbackAreas,
  hubFeedbackKinds,
  hubFeedbackSurfaces,
  type HubFeedbackArea,
  type HubFeedbackKind,
  type HubFeedbackSurface,
} from '@capability-hub/contracts';
import type { HubRoute } from '../../shared/navigation/history-route.js';
import { diagnosticGroups, type DiagnosticChoices, type DiagnosticRows } from './diagnostics.js';

export type DraftOrigin = Pick<HubRoute, 'page' | 'asset'>;

export interface FeedbackDraft {
  kind: HubFeedbackKind;
  surface?: HubFeedbackSurface;
  area?: HubFeedbackArea;
  title: string;
  description: string;
  steps: string;
  expected: string;
  blocking: boolean;
  choices: DiagnosticChoices;
  hadFiles: boolean;
}

export function emptyDraft(): FeedbackDraft {
  return {
    kind: 'bug',
    title: '',
    description: '',
    steps: '',
    expected: '',
    blocking: false,
    choices: {},
    hadFiles: false,
  };
}

export function hasFeedbackDraft(draft: FeedbackDraft): boolean {
  return Boolean(
    draft.title.trim() ||
    draft.description.trim() ||
    draft.steps.trim() ||
    draft.expected.trim() ||
    draft.blocking ||
    draft.kind !== 'bug' ||
    draft.surface ||
    draft.area ||
    draft.hadFiles ||
    Object.keys(draft.choices).length,
  );
}

export function defaultSurface(route: DraftOrigin): HubFeedbackSurface {
  return route.page === 'connect' && !route.asset ? 'mcp' : 'web';
}

export function defaultArea(route: DraftOrigin): HubFeedbackArea {
  return route.asset ? 'discover' : (option(hubFeedbackAreas, route.page) ?? 'other');
}

function option<T extends string>(options: Record<T, string>, input: unknown): T | undefined {
  return typeof input === 'string' && Object.hasOwn(options, input) ? (input as T) : undefined;
}

function record(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function text(input: unknown, max: number): string {
  return typeof input === 'string' ? input.slice(0, max) : '';
}

function draftKey(userId: string): string {
  return `capability-hub:feedback-draft:${userId}`;
}

export function readFeedbackDraft(userId: string): FeedbackDraft {
  try {
    const raw = window.sessionStorage.getItem(draftKey(userId));
    if (!raw) return emptyDraft();
    const stored = record(JSON.parse(raw));
    const flags = record(stored.choices);
    return {
      kind: option(hubFeedbackKinds, stored.kind) ?? 'bug',
      surface: option(hubFeedbackSurfaces, stored.surface),
      area: option(hubFeedbackAreas, stored.area),
      title: text(stored.title, 120),
      description: text(stored.description, 5000),
      steps: text(stored.steps, 3000),
      expected: text(stored.expected, 2000),
      blocking: stored.blocking === true,
      choices: Object.fromEntries(
        Object.keys(diagnosticGroups)
          .filter((group) => typeof flags[group] === 'boolean')
          .map((group) => [group, flags[group]]),
      ),
      hadFiles: stored.hadFiles === true,
    };
  } catch {
    return emptyDraft();
  }
}

export function saveFeedbackDraft(userId: string, draft: FeedbackDraft, rows: DiagnosticRows) {
  try {
    const choices = { ...draft.choices };
    // 刷新后采样条目已变更，不把上次单条授权套用到新样本。
    if (rows.requests) choices.requests = false;
    if (rows.errors) choices.errors = false;
    if (hasFeedbackDraft({ ...draft, choices })) {
      window.sessionStorage.setItem(draftKey(userId), JSON.stringify({ ...draft, choices }));
    } else {
      window.sessionStorage.removeItem(draftKey(userId));
    }
  } catch {
    // 站点存储不可用时仍可在本页编辑并提交。
  }
}
