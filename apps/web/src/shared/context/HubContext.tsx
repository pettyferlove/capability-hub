import { createContext, useContext } from 'react';
import type { MeResponse } from '@capability-hub/contracts/http';
export interface HubState {
  me: MeResponse | null;
  reviewCount: number;
  refresh: number;
  reload: () => void;
  openPalette: () => void;
  logout: () => Promise<void>;
}
export const HubCtx = createContext<HubState | undefined>(undefined);
export function useHub(): HubState {
  const state = useContext(HubCtx);
  if (!state) throw new Error('HubCtx.Provider is required');
  return state;
}
