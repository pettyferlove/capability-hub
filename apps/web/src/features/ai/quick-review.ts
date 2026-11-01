import { createContext } from 'react';

export interface ReviewOrigin {
  executionId: string;
  x: number;
  y: number;
}

export const QuickReview = createContext<{
  slot: HTMLDivElement | null;
  onAdopt?: (origin: ReviewOrigin) => void;
} | null>(null);
