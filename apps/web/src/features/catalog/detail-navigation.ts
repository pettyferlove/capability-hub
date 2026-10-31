export type DetailTab = 'overview' | 'files' | 'installation' | 'versions';
export interface DetailLocation {
  tab: DetailTab;
  path: string;
  anchor?: string;
}
export interface DetailNavigation {
  entries: DetailLocation[];
  index: number;
}
export type DetailNavigationAction =
  { type: 'open'; location: DetailLocation } | { type: 'back' | 'forward' };
export function detailLocationKey(location: DetailLocation) {
  return `${location.tab}:${location.path}#${location.anchor ?? ''}`;
}
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
