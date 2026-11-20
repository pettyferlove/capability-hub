import type { IsoDateTime } from './base.js';

export type HubFeedbackKind = 'bug' | 'ux' | 'suggestion' | 'question';
export type HubFeedbackSurface = 'web' | 'cli' | 'mcp' | 'other';
export type HubFeedbackArea =
  'discover' | 'publish' | 'review' | 'connect' | 'account' | 'operations' | 'other';
export type HubFeedbackChannel = 'web' | 'cli';
export type HubFeedbackStatus = 'pending' | 'in_progress' | 'needs_info' | 'resolved' | 'declined';
export type HubFeedbackDeclineReason =
  'duplicate' | 'cannot_reproduce' | 'not_hub_issue' | 'wont_do';
export type HubFeedbackMediaType =
  'image/png' | 'image/jpeg' | 'image/webp' | 'text/plain' | 'application/json';
export type HubFeedbackAttachmentKind = 'screenshot' | 'image' | 'text' | 'json';

export interface HubFeedbackRecord {
  id: string;
  number: number;
  submitted_by: string;
  channel: HubFeedbackChannel;
  kind: HubFeedbackKind;
  surface: HubFeedbackSurface;
  area: HubFeedbackArea | null;
  title: string;
  description: string;
  steps: string;
  expected: string;
  blocking: boolean;
  status: HubFeedbackStatus;
  decline_reason: HubFeedbackDeclineReason | null;
  duplicate_of_id: string | null;
  assignee_id: string | null;
  diagnostics: Record<string, unknown> | null;
  submission: Record<string, unknown>;
  description_redacted_at: IsoDateTime | null;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  closed_at: IsoDateTime | null;
  last_activity_at: IsoDateTime;
  last_submitter_activity_at: IsoDateTime;
  last_handler_public_at: IsoDateTime | null;
  submitter_seen_at: IsoDateTime;
  revision: number;
}

export interface HubFeedbackEventRecord {
  id: string;
  feedback_id: string;
  sequence: number;
  actor_id: string | null;
  actor_role: 'submitter' | 'handler' | 'system';
  kind: 'comment' | 'status' | 'assignment' | 'attachment_removed' | 'redaction';
  visibility: 'public' | 'internal';
  body: string;
  status_from: HubFeedbackStatus | null;
  status_to: HubFeedbackStatus | null;
  decline_reason: HubFeedbackDeclineReason | null;
  attachment_ids: string[];
  redacted_at: IsoDateTime | null;
  created_at: IsoDateTime;
}

export interface HubFeedbackAttachmentRecord {
  id: string;
  feedback_id: string;
  event_id: string | null;
  uploaded_by: string;
  kind: HubFeedbackAttachmentKind;
  media_type: HubFeedbackMediaType;
  name: string;
  size: number;
  width: number | null;
  height: number | null;
  sha256: string | null;
  created_at: IsoDateTime;
  removed_at: IsoDateTime | null;
  removed_by: string | null;
  removal_reason: 'submitter' | 'handler' | 'retention' | null;
}
