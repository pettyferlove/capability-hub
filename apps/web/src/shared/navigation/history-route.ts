import { hubPageFor, type HubPage } from '@capability-hub/contracts/web-pages';

/** 详情抽屉可由链接直接打开的页签；其余页签只在抽屉内切换，不进入地址。 */
export type AssetDrawerTab = 'installation' | 'feedback' | 'evaluation';

/**
 * 详情抽屉参数，只取自当前地址；背景页的查询串不参与，避免把背景的 `tab` 等误认为抽屉参数。
 * `invalid` 表示参数存在但不合法：抽屉应报错，不得退回当前发布。
 */
export interface AssetDrawer {
  slug: string;
  /** 固定版本 UUID；缺省表示查看资产当前发布。 */
  versionId?: string;
  tab?: AssetDrawerTab;
  /** 资源反馈深链接，抽屉据此直接打开「问题与建议」。 */
  feedbackId?: string;
  invalid?: 'version' | 'tab';
}

/** 一次导航解析出的路由形状，是 `<App>` 渲染分支的唯一判据。 */
export interface HubRoute {
  /** `not-found` 表示地址不属于任何页面；服务端对这类导航返回 404 状态的同一入口。 */
  page: HubPage | 'not-found';
  /** 解码后的资源 slug；有值表示详情抽屉叠加在 {@link HubRoute.page} 之上而不是独立页面。 */
  asset?: string;
  /** 与 {@link HubRoute.asset} 同时出现，取自当前地址的抽屉参数。 */
  drawer?: AssetDrawer;
  /** 原始查询串，已去掉前导 `?` 且不做解码；空串表示没有参数，避免到处判空 `undefined`。 */
  query: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 重复出现的参数视为非法，避免不同解析方取到不同的值。 */
function assetDrawer(slug: string, query: string): AssetDrawer {
  const values = new URLSearchParams(query);
  const drawer: AssetDrawer = { slug };
  const versions = values.getAll('version_id');
  const tabs = values.getAll('tab');
  const feedback = values.getAll('feedback');
  if (versions.length > 1 || (versions.length && !uuidPattern.test(versions[0])))
    drawer.invalid = 'version';
  else if (versions.length) drawer.versionId = versions[0];
  if (feedback.length === 1 && feedback[0]) drawer.feedbackId = feedback[0];
  if (
    tabs.length > 1 ||
    (tabs.length && !['installation', 'feedback', 'evaluation'].includes(tabs[0]))
  )
    drawer.invalid ??= 'tab';
  else if (tabs.length) drawer.tab = tabs[0] as AssetDrawerTab;
  else if (drawer.feedbackId) drawer.tab = 'feedback';
  return drawer;
}

/** 资源标识只解码一次，非法资源路径回到可用的目录页面，未知页面交给 404 页。 */
export function parseHistoryRoute(pathname: string, search = ''): HubRoute {
  const query = search.replace(/^\?/, '');
  const page = hubPageFor(pathname + (query ? '?' + query : ''));
  if (!page) return { page: 'not-found', query: '' };
  const assetMatch = /^\/asset\/([^/]+)\/?$/.exec(pathname);
  if (assetMatch) {
    try {
      const asset = decodeURIComponent(assetMatch[1]);
      return asset
        ? { page: 'discover', asset, drawer: assetDrawer(asset, query), query }
        : { page: 'discover', query: '' };
    } catch {
      return { page: 'discover', query: '' };
    }
  }
  return { page, query };
}

/**
 * 拼出站内链接；值为 `undefined` 或空串的键直接丢弃，保证同一筛选条件产生同一个 URL（可安全比较与写入历史）。
 * 参数顺序由调用方的对象字面量决定，不排序，因此调用方要自己保持稳定顺序来避免 URL 抖动。
 */
export function pageHref(page: HubPage, values: Record<string, string | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  return '/' + page + (query.size ? '?' + query.toString() : '');
}

/**
 * slug 会做一次百分号编码；消费端 {@link parseHistoryRoute} 只解码一次，双向必须配对。
 * 参数按 `version_id`、`tab` 的固定顺序写入，同一抽屉总得到同一个地址。
 */
export function assetHref(
  slug: string,
  options: { versionId?: string; tab?: AssetDrawerTab } = {},
): string {
  const query = new URLSearchParams();
  if (options.versionId) query.set('version_id', options.versionId);
  if (options.tab) query.set('tab', options.tab);
  return '/asset/' + encodeURIComponent(slug) + (query.size ? '?' + query.toString() : '');
}

/** 登录链接把当前页塞进 `return_to`；{@link loginReturnPath} 会再校验一次，所以这里可以放心透传。 */
export function loginHref(returnTo = '/discover'): string {
  return pageHref('login', { return_to: returnTo });
}

/** 登录后只返回已知本地页面，保留详情与筛选条件。 */
export function loginReturnPath(query: string): string {
  const target = new URLSearchParams(query).get('return_to') ?? '/discover';
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\'))
    return '/discover';
  const page = hubPageFor(target);
  return page && page !== 'login' ? target : '/discover';
}

/** 审核列表的筛选取值；必须与 `PublicationRequestResponse['state']` 的联合保持一致，任一侧新增状态都要同步。 */
export const publicationStates = ['pending', 'approved', 'rejected', 'stale', 'cancelled'] as const;

/** `state` 查询参数的合法取值；非法值不会报错，而是在 {@link reviewLocation} 里退回 `pending`。 */
export type PublicationStateFilter = (typeof publicationStates)[number];

/**
 * 审核页位置由 `state` 与 `request` 两个查询参数共同决定；`state` 非法时落回 `pending` 而不是留空，
 * 保证列表总有一个可用筛选。`request` 只指定当前查看的申请，不需要校验它是否落在该筛选的结果里，
 * 因为在结果中找不到时列表会退回第一条。
 */
export function reviewLocation(query: string): { state: PublicationStateFilter; request: string } {
  const values = new URLSearchParams(query);
  const requested = values.get('state');
  return {
    state: publicationStates.includes(requested as PublicationStateFilter)
      ? (requested as PublicationStateFilter)
      : 'pending',
    request: values.get('request') ?? '',
  };
}
