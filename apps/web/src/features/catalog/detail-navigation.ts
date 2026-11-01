/** 详情面板的五个互斥视图，同一时刻只挂载其中一个。 */
export type DetailTab = 'overview' | 'files' | 'installation' | 'versions' | 'feedback';
/** 面板内的一次历史位置；`path` 只在 `files` 视图下决定预览哪个文件。 */
export interface DetailLocation {
  tab: DetailTab;
  path: string;
  /** 文件预览内的 Markdown 标题锚点，滚动恢复时据此定位。 */
  anchor?: string;
}
/** 浏览器式历史栈；`index` 恒落在 `entries` 的合法下标内。 */
export interface DetailNavigation {
  entries: DetailLocation[];
  index: number;
}
/** 只有跳转与前后移动两种动作；`open` 语义是「记录新位置」。 */
export type DetailNavigationAction =
  { type: 'open'; location: DetailLocation } | { type: 'back' | 'forward' };
/** 位置判重与滚动位置缓存的键；缺省锚点与空串等价。 */
export function detailLocationKey(location: DetailLocation) {
  return `${location.tab}:${location.path}#${location.anchor ?? ''}`;
}
/**
 * 返回新 state；后退/前进在首尾处夹取，越界时原样返回入参引用，调用方可据引用相等跳过重渲染。
 * `open` 到与当前位置相同 key 时同样返回原引用；否则丢弃 `index` 之后的前进历史，
 * 与浏览器在历史中段跳转会截断后续记录的行为一致。
 */
export function detailNavigation(
  state: DetailNavigation,
  action: DetailNavigationAction,
): DetailNavigation {
  if (action.type !== 'open') {
    const index = Math.max(
      0,
      Math.min(state.entries.length - 1, state.index + (action.type === 'back' ? -1 : 1)),
    );
    return index === state.index ? state : { ...state, index };
  }
  if (detailLocationKey(state.entries[state.index]) === detailLocationKey(action.location))
    return state;
  const entries = [...state.entries.slice(0, state.index + 1), action.location];
  return { entries, index: entries.length - 1 };
}
