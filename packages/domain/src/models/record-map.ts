import type {
  OAuthClientRecord,
  OAuthRequestRecord,
  OAuthGrantRecord,
  OAuthCredentialRecord,
  UserRecord,
  GroupRecord,
  MembershipRecord,
  RoleRecord,
  RoleBindingRecord,
  SessionRecord,
  TokenRecord,
  CliLoginRecord,
  LoginAttemptRecord,
} from './identity.js';
import type { SourceRecord, BindingRecord, GitCredentialRecord } from './source.js';
import type {
  AssetRecord,
  VersionRecord,
  RecommendationRecord,
  AssetFeedbackRecord,
  ScenarioRecord,
} from './catalog.js';
import type { IntakeRecord, ScanRecord } from './intake.js';
import type { PublicationRequestRecord, ReleaseRecord } from './publication.js';
import type { JobRecord } from './job.js';
import type { AuditRecord } from './audit.js';
import type { IdempotencyRecord } from './idempotency.js';

export interface RecordMap {
  oauth_clients: OAuthClientRecord;
  oauth_requests: OAuthRequestRecord;
  oauth_grants: OAuthGrantRecord;
  oauth_credentials: OAuthCredentialRecord;
  users: UserRecord;
  groups: GroupRecord;
  memberships: MembershipRecord;
  roles: RoleRecord;
  role_bindings: RoleBindingRecord;
  sessions: SessionRecord;
  tokens: TokenRecord;
  cli_logins: CliLoginRecord;
  login_attempts: LoginAttemptRecord;
  sources: SourceRecord;
  assets: AssetRecord;
  bindings: BindingRecord;
  intakes: IntakeRecord;
  versions: VersionRecord;
  scans: ScanRecord;
  requests: PublicationRequestRecord;
  releases: ReleaseRecord;
  jobs: JobRecord;
  audit: AuditRecord;
  idempotency: IdempotencyRecord;
  scenarios: ScenarioRecord;
  git_credentials: GitCredentialRecord;
  recommendations: RecommendationRecord;
  asset_feedback: AssetFeedbackRecord;
}

export type TableName = keyof RecordMap;
