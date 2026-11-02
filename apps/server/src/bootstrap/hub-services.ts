import {
  AssetAccessService,
  AgentEvidenceService,
  AssetFeedbackService,
  AssetCommunityService,
  AssetContentService,
  AssetLifecycleService,
  AssetManagementQueryService,
  AuditService,
  AuthenticationService,
  CatalogService,
  CliLoginService,
  GitCredentialService,
  McpSharedKeyService,
  IdempotencyService,
  IdentityAdministrationService,
  IdentityService,
  IntakeProcessor,
  IntakeQueryService,
  IntakeService,
  JobQueue,
  ProfileService,
  PublicationQueryService,
  PublicationService,
  SessionService,
  SourceService,
  SourceSyncService,
  TokenService,
  OAuthService,
} from '@capability-hub/application';
import type { LogContext } from '@capability-hub/logging/server';
import type { BlobStorage } from '@capability-hub/application/ports';
import type { RecordStore } from '@capability-hub/application/ports';
import { GitRepositoryAdapter } from '@capability-hub/infrastructure/git';
import { scanIsolated } from '@capability-hub/infrastructure/scanning';
import {
  ScryptPasswordHasher,
  LdapAuthenticator,
  AesCredentialCipher,
  OpenSshKeyInspector,
  SignedCatalogCursorCodec,
} from '@capability-hub/infrastructure/security';
import type { ServerConfig } from '../config/server-config.js';
import { HubAiServices } from './ai-services.js';

/** HTTP、MCP 与 Worker 复用同一组应用用例。 */
export class HubServices {
  readonly ai: HubAiServices;
  readonly git: GitRepositoryAdapter;
  readonly assetAccess: AssetAccessService;
  readonly assetManagement: AssetManagementQueryService;
  readonly catalog: CatalogService;
  readonly content: AssetContentService;
  readonly feedback: AssetFeedbackService;
  readonly community: AssetCommunityService;
  readonly idempotency: IdempotencyService;
  readonly jobs: JobQueue;
  readonly intakes: IntakeService;
  readonly intakeQueries: IntakeQueryService;
  readonly intakeProcessor: IntakeProcessor;
  readonly publicationQueries: PublicationQueryService;
  readonly publications: PublicationService;
  readonly lifecycle: AssetLifecycleService;
  readonly audit: AuditService;
  readonly identity: IdentityService;
  readonly authentication: AuthenticationService;
  readonly administration: IdentityAdministrationService;
  readonly sessions: SessionService;
  readonly tokens: TokenService;
  readonly oauth: OAuthService;
  readonly credentials: GitCredentialService;
  readonly mcpKeys: McpSharedKeyService;
  readonly cliLogin: CliLoginService;
  readonly profile: ProfileService;
  readonly sources: SourceService;
  readonly sourceSync: SourceSyncService;
  constructor(
    readonly store: RecordStore,
    readonly blobs: BlobStorage,
    readonly config: ServerConfig,
    readonly logs: LogContext,
  ) {
    this.identity = new IdentityService(store);
    const context = { store, blobs, identity: this.identity };
    this.sessions = new SessionService(store, this.identity);
    const passwords = new ScryptPasswordHasher();
    this.authentication = new AuthenticationService(
      store,
      this.identity,
      this.sessions,
      passwords,
      config.ldap
        ? {
            authenticator: new LdapAuthenticator(config.ldap),
            defaultRoles: config.ldap.defaultRoles,
          }
        : undefined,
    );
    this.idempotency = new IdempotencyService(store, this.identity);
    this.administration = new IdentityAdministrationService(
      store,
      this.identity,
      this.sessions,
      passwords,
      this.idempotency,
    );
    this.tokens = new TokenService(store, this.identity);
    this.oauth = new OAuthService(store, this.identity, config.publicUrl);
    this.credentials = new GitCredentialService(
      store,
      config.gitHosts,
      new AesCredentialCipher(config.secret),
      new OpenSshKeyInspector(),
    );
    this.cliLogin = new CliLoginService(store, this.identity, this.tokens, config.publicUrl);
    this.profile = new ProfileService(store, this.identity, this.credentials, config.gitHosts);
    this.git = new GitRepositoryAdapter(config, this.credentials);
    this.assetAccess = new AssetAccessService(store, this.identity);
    this.assetManagement = new AssetManagementQueryService(context, this.assetAccess);
    this.feedback = new AssetFeedbackService(context, this.assetAccess, (version, feedbackId) =>
      this.ai.autoTriage(version, feedbackId),
    );
    this.community = new AssetCommunityService(context, this.assetAccess);
    this.catalog = new CatalogService(
      context,
      this.assetAccess,
      this.community,
      new SignedCatalogCursorCodec(config.secret),
    );
    this.content = new AssetContentService(context, this.assetAccess);
    this.mcpKeys = new McpSharedKeyService(
      context,
      this.assetAccess,
      this.idempotency,
      new AesCredentialCipher(config.secret, 'mcp-header-v1'),
    );
    this.jobs = new JobQueue(store, config.workerConcurrency);
    this.intakeQueries = new IntakeQueryService(context, this.assetAccess);
    this.intakeProcessor = new IntakeProcessor(
      context,
      this.assetAccess,
      this.jobs,
      scanIsolated,
      async (requestedBy, versionId) => {
        await this.ai.autoSubmit(requestedBy, 'resource-audit', versionId);
      },
    );
    this.intakes = new IntakeService(
      context,
      this.assetAccess,
      this.jobs,
      this.idempotency,
      this.intakeQueries,
      this.mcpKeys,
    );
    this.publicationQueries = new PublicationQueryService(context, this.assetAccess);
    this.publications = new PublicationService(
      context,
      this.assetAccess,
      this.idempotency,
      this.mcpKeys,
      async (principal, versionId) => {
        await this.ai.autoSubmit(principal, 'resource-audit', versionId);
      },
    );
    this.lifecycle = new AssetLifecycleService(context, this.assetAccess, this.publications);
    this.audit = new AuditService(context, this.assetAccess);
    this.sources = new SourceService(
      context,
      this.assetAccess,
      this.publications,
      this.idempotency,
      this.jobs,
      this.git,
      this.credentials,
    );
    this.sourceSync = new SourceSyncService(
      context,
      this.assetAccess,
      this.intakeProcessor,
      this.jobs,
      this.git,
      this.credentials,
    );
    this.ai = new HubAiServices(
      this.identity,
      store,
      this.jobs,
      this.assetAccess,
      this.content,
      config,
      new AgentEvidenceService(context, this.assetAccess, this.feedback),
      this.publicationQueries,
    );
  }
}
