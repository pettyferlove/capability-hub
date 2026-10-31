import type { Applicability } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';
export interface SubmitPublicationCommand extends Policy {
  source_intake_id: string;
  version_id: string;
  applies_to: Applicability;
  purpose: string;
  base_release_id: string | null;
}
export interface PublicationDecisionCommand {
  decision: 'approve' | 'reject';
  comment: string;
  policy_digest: string;
  accepted_warnings: { finding_id: string; reason: string }[];
}
export interface NominateAssetCommand {
  release_id: string;
  reason: string;
}
