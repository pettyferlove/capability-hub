import type {
  HubFeedbackArea,
  HubFeedbackAttachmentKind,
  HubFeedbackChannel,
  HubFeedbackDeclineReason,
  HubFeedbackDiagnostics,
  HubFeedbackKind,
  HubFeedbackStatus,
  HubFeedbackSurface,
} from '../hub-feedback.js';
import type { LoginProvider, SessionClientInfo } from '../identity.js';

export interface HubFeedbackSubmissionResponse {
  channel: HubFeedbackChannel;
  credential_type: 'session' | 'personal_token';
  token_name: string | null;
  received_at: string;
  request_id: string;
  hub_version: string;
  hub_commit: string;
  web_build: string | null;
  client: SessionClientInfo | null;
}

export interface HubFeedbackItemResponse {
  id: string;
  number: number;
  kind: HubFeedbackKind;
  surface: HubFeedbackSurface;
  area: HubFeedbackArea | null;
  channel: HubFeedbackChannel;
  title: string;
  blocking: boolean;
  status: HubFeedbackStatus;
  created_at: string;
  last_activity_at: string;
  revision: number;
  unread: boolean;
  awaiting_reply: boolean;
  submitter?: { id: string; display_name: string; auth_provider: LoginProvider };
  assignee_id?: string | null;
}

export interface HubFeedbackEventResponse {
  id: string;
  sequence: number;
  actor_role: 'submitter' | 'handler' | 'system';
  actor_name: string | null;
  kind: 'comment' | 'status' | 'assignment' | 'attachment_removed' | 'redaction';
  visibility: 'public' | 'internal';
  body: string;
  status_from: HubFeedbackStatus | null;
  status_to: HubFeedbackStatus | null;
  decline_reason: HubFeedbackDeclineReason | null;
  attachment_ids: string[];
  redacted_at: string | null;
  created_at: string;
}

export interface HubFeedbackAttachmentResponse {
  id: string;
  event_id: string | null;
  kind: HubFeedbackAttachmentKind;
  media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'text/plain' | 'application/json';
  name: string;
  size: number;
  width: number | null;
  height: number | null;
  removed_at: string | null;
  can_remove: boolean;
}

export interface HubFeedbackDetailResponse extends HubFeedbackItemResponse {
  description: string;
  steps: string;
  expected: string;
  diagnostics: HubFeedbackDiagnostics | null;
  submission?: HubFeedbackSubmissionResponse;
  description_redacted_at: string | null;
  closed_at: string | null;
  decline_reason: HubFeedbackDeclineReason | null;
  duplicate_of?: number | null;
  events: HubFeedbackEventResponse[];
  attachments: HubFeedbackAttachmentResponse[];
}

export interface HubFeedbackListResponse {
  items: HubFeedbackItemResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface HubFeedbackSummaryResponse {
  unread: number;
  open: number;
}

export interface HubFeedbackQueueSummaryResponse {
  pending: number;
  awaiting_reply: number;
  assigned_to_me: number;
}
