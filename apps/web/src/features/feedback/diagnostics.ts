import {
  hubFeedbackDiagnosticsSchema,
  hubFeedbackFailedRequestSchema,
  type HubFeedbackDiagnostics,
  type HubFeedbackFailedRequest,
} from '@capability-hub/contracts';
import { latestHubVersion, recentFailedRequests } from '../../shared/api/client.js';
import { bundledWebBuild } from '../../shared/api/web-build.js';
import type { HubFeedbackSeed } from '../../shared/hub-feedback-events.js';
import { recentBrowserDiagnostics } from '../../shared/logging.js';
import { parseHistoryRoute, type HubRoute } from '../../shared/navigation/history-route.js';

type WebDiagnostics = Extract<HubFeedbackDiagnostics['client'], { kind: 'web' }>;
type PageError = NonNullable<WebDiagnostics['page_errors']>[number];
const webFields = hubFeedbackDiagnosticsSchema.shape.client.options[0].shape;
const queryFields = webFields.query.unwrap().shape;
const pageErrorSchema = webFields.page_errors.unwrap().element;

export const diagnosticGroups = {
  page: '页面与版本',
  device: '浏览器与设备',
  requests: '最近失败的请求',
  errors: '最近页面错误',
  asset: '当前查看的资源',
} as const;
export type DiagnosticGroup = keyof typeof diagnosticGroups;
export type DiagnosticChoices = Partial<Record<DiagnosticGroup, boolean>>;
export type DiagnosticRows = Partial<Record<'requests' | 'errors', Record<number, boolean>>>;

export interface DiagnosticSnapshot {
  page: Pick<
    WebDiagnostics,
    'page' | 'query' | 'web_build' | 'hub_version' | 'telemetry_session_id'
  >;
  device: Pick<
    WebDiagnostics,
    | 'viewport'
    | 'device_pixel_ratio'
    | 'theme'
    | 'palette'
    | 'reduced_motion'
    | 'language'
    | 'timezone'
    | 'online'
  >;
  requests: HubFeedbackFailedRequest[];
  errors: PageError[];
  asset?: string;
  recentSince: number;
}

function value<T>(
  schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } },
  input: unknown,
): T | undefined {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function routeQuery(query: string): WebDiagnostics['query'] {
  const params = new URLSearchParams(query);
  const normalized = {
    tab: value(queryFields.tab, params.get('tab')),
    view: value(queryFields.view, params.get('view')),
    state: value(queryFields.state, params.get('state')),
    request: value(queryFields.request, params.get('request')),
    execution: value(queryFields.execution, params.get('execution')),
    feedback: value(queryFields.feedback, params.get('feedback')),
  };
  return Object.values(normalized).some((entry) => entry !== undefined) ? normalized : undefined;
}

function requestRecord(request: HubFeedbackFailedRequest): HubFeedbackFailedRequest | undefined {
  const path =
    typeof request.path === 'string'
      ? request.path.split(/[?#]/, 1)[0].replace(/^(\/api\/install-tickets\/)[^/]+/, '$1~ticket')
      : undefined;
  return value(hubFeedbackFailedRequestSchema, {
    at: request.at,
    method: request.method,
    path,
    status: request.status,
    code: request.code,
    request_id: request.request_id,
  });
}

function pageError(event: unknown, type: unknown, stack?: unknown): PageError | undefined {
  return value(pageErrorSchema, {
    event,
    type: typeof type === 'string' && /^[\w.-]{1,80}$/.test(type) ? type : 'Error',
    stack: value(
      pageErrorSchema.shape.stack,
      typeof stack === 'string' ? stack.replace(/\r\n/g, '\n').slice(0, 2000) : undefined,
    ),
  });
}

export function sampleDiagnostics(route: HubRoute, seed?: HubFeedbackSeed): DiagnosticSnapshot {
  const browser = recentBrowserDiagnostics();
  const requests = seed
    ? seed.request
      ? [seed.request]
      : []
    : [...recentFailedRequests()].reverse();
  const errors = seed
    ? seed.pageError
      ? [pageError(seed.pageError.event, seed.pageError.type, seed.pageError.stack)]
      : []
    : [...browser.entries]
        .reverse()
        .map((entry) =>
          entry.error ? pageError(entry.event, entry.error.type, entry.error.stack) : undefined,
        );
  const root = document.documentElement;
  const assetRoute = route.asset ? parseHistoryRoute(location.pathname, location.search) : null;
  const activeRoute = assetRoute && assetRoute.asset === route.asset ? assetRoute : route;
  return {
    page: {
      page: value(webFields.page, activeRoute.page),
      query: routeQuery(activeRoute.query),
      web_build: value(
        webFields.web_build,
        bundledWebBuild ??
          document.querySelector('meta[name="capability-hub-build"]')?.getAttribute('content'),
      ),
      hub_version: value(webFields.hub_version, latestHubVersion()),
      telemetry_session_id: value(webFields.telemetry_session_id, browser.sessionId),
    },
    device: {
      viewport: value(webFields.viewport, { width: window.innerWidth, height: window.innerHeight }),
      device_pixel_ratio: value(webFields.device_pixel_ratio, window.devicePixelRatio),
      theme: value(
        webFields.theme,
        root.dataset.theme ??
          (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
      ),
      palette: value(webFields.palette, root.dataset.palette),
      reduced_motion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      language: value(webFields.language, navigator.language),
      timezone: value(webFields.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone),
      online: navigator.onLine,
    },
    requests: requests
      .map(requestRecord)
      .filter((request) => request !== undefined)
      .slice(0, 10),
    errors: errors.filter((error) => error !== undefined).slice(0, 5),
    asset: value(webFields.asset_slug, route.asset),
    recentSince: seed ? 0 : Date.now() - 5 * 60_000,
  };
}

export function diagnosticRowSelected(
  sample: DiagnosticSnapshot,
  choices: DiagnosticChoices,
  rows: DiagnosticRows,
  group: 'requests' | 'errors',
  index: number,
): boolean {
  return (
    rows[group]?.[index] ??
    choices[group] ??
    (group === 'errors' || Date.parse(sample.requests[index].at) >= sample.recentSince)
  );
}

export function selectedDiagnostics(
  sample: DiagnosticSnapshot,
  choices: DiagnosticChoices,
  rows: DiagnosticRows,
): HubFeedbackDiagnostics | null {
  const client: WebDiagnostics = { kind: 'web' };
  if (choices.page !== false) Object.assign(client, sample.page);
  if (choices.device !== false) Object.assign(client, sample.device);
  if (choices.asset === true && sample.asset) client.asset_slug = sample.asset;
  const requests = sample.requests.filter((_, index) =>
    diagnosticRowSelected(sample, choices, rows, 'requests', index),
  );
  const errors = sample.errors.filter((_, index) =>
    diagnosticRowSelected(sample, choices, rows, 'errors', index),
  );
  if (requests.length) client.failed_requests = requests;
  if (errors.length) client.page_errors = errors;
  if (!Object.entries(client).some(([key, field]) => key !== 'kind' && field !== undefined))
    return null;
  const payload = { client };
  const parsed = hubFeedbackDiagnosticsSchema.safeParse(payload);
  return parsed.success ? parsed.data : payload;
}
