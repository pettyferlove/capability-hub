import { createContext, useContext } from 'react';
import type { MeResponse } from '@capability-hub/contracts/http';
/** 全局会话上下文：`me` 为 `null` 表示当前未登录（外壳可能仍渲染公开页面）。 */
export interface HubState {
  /** 当前登录用户；`null` 表示未登录，此时 `capabilities` 不可用，调用方必须先判空。 */
  me: MeResponse | null;
  /** 待审核数量，0 表示没有；只用于角标，不保证与审核页队列实时一致。 */
  reviewCount: number;
  /** 递增的刷新计数；把它传给 {@link useQuery} 的 `refresh` 即触发重取。 */
  refresh: number;
  /** 增加 `refresh` 并让所有订阅该值的查询重取，用于「刷新」按钮与写操作后的同步。 */
  reload: () => void;
  /** 打开命令面板；由外壳持有面板状态，页面内触发时不必自己维护弹层。 */
  openPalette: () => void;
  /** 退出登录；失败会 reject，调用方需要自行展示错误。 */
  logout: () => Promise<void>;
}
/** 上下文默认 `undefined` 以便区分「未提供」与「未登录」，缺少 Provider 时立刻抛错而不是静默降级。 */
export const HubCtx = createContext<HubState | undefined>(undefined);
/**
 * 读取全局会话状态；必须在 `<HubCtx.Provider>` 内使用，否则抛错——
 * 这个错误只会在开发期出现（外壳总是提供 Provider），因此不需要调用方兜底。
 */
export function useHub(): HubState {
  const state = useContext(HubCtx);
  if (!state) throw new Error('HubCtx.Provider is required');
  return state;
}
