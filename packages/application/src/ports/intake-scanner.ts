import type { ContentFile, ContentInspection } from '@capability-hub/domain/content';

export type ScanInput = { kind: 'skill' | 'mcp'; slug: string } & (
  { files: ContentFile[]; bytes?: never } | { bytes: Buffer; files?: never }
);
export type IntakeScanner = (
  input: ScanInput,
) => Promise<{ inspected: ContentInspection; zip: Buffer }>;
