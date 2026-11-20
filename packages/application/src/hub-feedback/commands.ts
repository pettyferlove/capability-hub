import type {
  HubFeedbackArea,
  HubFeedbackAttachmentKind,
  HubFeedbackChannel,
  HubFeedbackDeclineReason,
  HubFeedbackKind,
  HubFeedbackStatus,
  HubFeedbackSurface,
} from '@capability-hub/domain/models';
import type { SessionClientInfo } from '@capability-hub/domain/identity';

export interface HubFeedbackCreateCommand {
  kind: HubFeedbackKind;
  surface: HubFeedbackSurface;
  area: HubFeedbackArea | null;
  title: string;
  description: string;
  steps: string;
  expected: string;
  blocking: boolean;
  diagnostics: Record<string, unknown> | null;
}

export interface HubFeedbackSubmission {
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

export interface HubFeedbackUpload {
  bytes: Buffer;
  kind: HubFeedbackAttachmentKind;
  name: string;
}

export interface HubFeedbackUpdateCommand {
  status?: HubFeedbackStatus;
  decline_reason?: HubFeedbackDeclineReason;
  duplicate_of?: number;
  assignee_id?: string | null;
  message?: string;
}

export type HubFeedbackRedactionCommand =
  { target: 'description' } | { target: 'event'; event_id: string };

export interface HubFeedbackMutation {
  key: string | undefined;
  etag: string | undefined;
}

export type HubFeedbackAccess = 'submitter' | 'handler';
