import { z } from 'zod';
import { isCatalogPromptText } from './catalog-prompt.js';
import type { RecordMap, TableName } from './record-map.js';

const id = z.string().min(1);
const text = z.string();
const strings = z.array(text);
const integer = z.number().int().nonnegative();
const revision = z.number().int().positive();
const date = z.iso.datetime();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const jsonObject = z.record(text, z.unknown());
const encryptedCredential = z.strictObject({ iv: text, tag: text, data: text });
const mcpSharedKey = z.strictObject({
  url: text,
  name: text,
  scheme: z.literal('bearer').optional(),
  encrypted: encryptedCredential,
});
const base = { id };
const versioned = { ...base, revision };
const applicability = z.strictObject({
  languages: strings.optional(),
  frameworks: strings.optional(),
  keywords: strings.optional(),
});
const policy = {
  category: z.enum(['general', 'scenario', 'uncategorized']),
  scenario_ids: strings,
  distribution: z.strictObject({ mode: z.literal('approved_audience'), audience: strings }),
};
const consent = z.strictObject({
  actor_id: id,
  confirmed_at: date,
  permission_basis: text,
  purpose: text,
  content_digest: digest,
  audience: strings,
});
const manifestFile = z.strictObject({
  path: text,
  size: integer,
  sha256: hash,
  executable: z.boolean(),
});
const manifest = z.strictObject({
  schema_version: z.literal(1),
  kind: z.enum(['skill', 'mcp']),
  files: z.array(manifestFile),
});
const installationInput = {
  value: text.optional(),
  isSecret: z.boolean().optional(),
  isRequired: z.boolean().optional(),
  variables: jsonObject.optional(),
};
const variable = z.strictObject({ name: text, ...installationInput });
const argument = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('named'), name: text, ...installationInput }),
  z.strictObject({ type: z.literal('positional'), ...installationInput }),
]);
const installationOption = z.strictObject({
  option_id: text,
  kind: z.enum(['remote', 'package']),
  supported: z.boolean(),
  type: text.optional(),
  url: text.optional(),
  variables: jsonObject.optional(),
  headers: z.array(variable).optional(),
  registryType: text.optional(),
  identifier: text.optional(),
  version: text.optional(),
  transport: z.strictObject({ type: text }).optional(),
  runtimeArguments: z.array(argument).optional(),
  packageArguments: z.array(argument).optional(),
  environmentVariables: z.array(variable).optional(),
});
const metadata = z.strictObject({
  name: text,
  description: text,
  applies_to: applicability.optional(),
  frontmatter: jsonObject.optional(),
  has_scripts: z.boolean().optional(),
  has_archives: z.boolean().optional(),
  server_json: jsonObject.optional(),
  schema_id: text.optional(),
  schema_digest: digest.optional(),
  installation_options: z.array(installationOption).optional(),
  declared_tools: strings.optional(),
  tools_verified: z.boolean().optional(),
});
const intakeState = z.enum(['received', 'fetching', 'scanning', 'ready', 'failed', 'cancelled']);
const targetResult = z.strictObject({
  id,
  binding_id: id,
  intake_id: id,
  state: intakeState,
  version_id: id.nullish(),
  error_code: text.nullish(),
  reused: z.boolean().optional(),
});
const sourceBase = {
  ...versioned,
  owner_group_id: id,
  state: z.enum(['active', 'paused', 'blocked', 'auth_error']),
  generation: integer,
  created_at: date,
  distribution_revoked_at: date.optional(),
};
const scope = z.enum(['platform', 'team', 'source', 'asset', 'scenario']);
const client = z.strictObject({
  browser_name: text.nullable(),
  browser_version: text.nullable(),
  os_name: text.nullable(),
  device_type: z.enum(['desktop', 'mobile', 'tablet', 'unknown']),
});
const subject = z.strictObject({
  kind: z.enum([
    'user',
    'group',
    'role',
    'grant',
    'membership',
    'token',
    'session',
    'cli',
    'connection',
    'asset',
    'version',
    'intake',
    'publication',
    'source',
    'credential',
    'scenario',
    'feedback',
    'instance',
    'unknown',
  ]),
  name: text,
  detail: text,
  asset_id: id.optional(),
  version_id: id.optional(),
  request_id: id.optional(),
});

const jobBase = {
  ...base,
  aggregate_id: id,
  state: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  attempt: integer,
  run_after: integer,
  lease_epoch: integer,
  lease_until: integer,
  lease_owner: id.optional(),
  cancel_requested: z.boolean(),
  created_at: date,
  finished_at: date.optional(),
  last_error_code: text.optional(),
  error_message: text.optional(),
  result: z
    .strictObject({
      origin_commit: text,
      source_revision: revision.optional(),
      targets: z.array(targetResult),
    })
    .optional(),
};

const hubFeedbackStatus = z.enum(['pending', 'in_progress', 'needs_info', 'resolved', 'declined']);
const hubFeedbackDeclineReason = z.enum([
  'duplicate',
  'cannot_reproduce',
  'not_hub_issue',
  'wont_do',
]);

function boundedHubFeedbackValue(value: unknown, depth: number): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'string') return value.length <= 5000;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value))
    return value.length <= 128 && value.every((item) => boundedHubFeedbackValue(item, depth + 1));
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 64 &&
    entries.every(([key, item]) => key.length <= 120 && boundedHubFeedbackValue(item, depth + 1))
  );
}

const hubFeedbackJson = jsonObject.refine((value) => boundedHubFeedbackValue(value, 0));

const promptId = id.refine(isCatalogPromptText);
const promptSource = z.strictObject({
  asset_id: promptId,
  version_id: promptId,
  release_id: promptId,
  resolved_release_id: promptId,
});
const promptItem = z
  .strictObject({
    suggestion_ref: promptId,
    label: text.min(1).max(28),
    text: text.min(1).max(200),
    basis: z.strictObject({
      asset_id: promptId,
      version_id: promptId,
      release_id: promptId,
      fields: z
        .array(z.enum(['tag', 'scenario', 'description']))
        .min(1)
        .max(3),
      direction: text.min(1).max(28).nullable().optional(),
    }),
  })
  .transform(({ basis: { direction, ...basis }, ...item }, ctx) => {
    if (isCatalogPromptText(item.label) && isCatalogPromptText(item.text))
      return { ...item, basis };
    // 旧 SQLite 行可能含不能恢复到 JSONB 的提示；舍弃该项，不丢弃同批其他提示。
    if (direction !== undefined) return null;
    ctx.addIssue({ code: 'custom', message: '提示含不可存储的字符' });
    return z.NEVER;
  });
const promptBatch = z
  .strictObject({
    id: promptId,
    audience: z.enum(['public', 'restricted']),
    audience_signature: hash,
    input_digest: hash,
    policy_digest: hash,
    sources: z.array(promptSource).min(1).max(12),
    generated_at: date,
    prompts: z
      .array(promptItem)
      .max(4)
      .transform((items) => items.filter((item) => item !== null)),
  })
  .refine(
    (batch) =>
      new Set(batch.sources.map((source) => source.version_id)).size === batch.sources.length &&
      new Set(batch.prompts.map((prompt) => prompt.text)).size === batch.prompts.length &&
      batch.prompts.every((prompt) =>
        batch.sources.some(
          (source) =>
            source.asset_id === prompt.basis.asset_id &&
            source.version_id === prompt.basis.version_id &&
            source.resolved_release_id === prompt.basis.release_id,
        ),
      ),
    '提示依据必须属于本批来源且不重复',
  );

/** 外部快照和数据库 JSON 在进入类型化记录之前必须满足当前结构。 */
const schemas = {
  oauth_clients: z.strictObject({
    ...base,
    name: text,
    redirect_uris: strings,
    created_at: integer,
  }),
  oauth_requests: z.strictObject({
    ...base,
    client_id: id,
    redirect_uri: text,
    resource: text,
    scope: z.enum(['hub:read', 'hub:contribute']),
    challenge: text,
    state: text,
    expires_at: integer,
    status: z.enum(['pending', 'approved', 'denied', 'consumed']),
    code: text.nullable(),
    user_id: id.nullable(),
    grant_id: id.nullable(),
  }),
  oauth_grants: z.strictObject({
    ...base,
    client_id: id,
    user_id: id,
    name: text,
    scope: z.enum(['hub:read', 'hub:contribute']),
    resource: text,
    created_at: integer,
    last_used_at: integer.nullable(),
    revoked_at: integer.nullable(),
  }),
  oauth_credentials: z.strictObject({
    ...base,
    grant_id: id,
    kind: z.enum(['access', 'refresh']),
    expires_at: integer,
    consumed_at: integer.nullable(),
  }),
  users: z
    .strictObject({
      ...versioned,
      username: text,
      display_name: text,
      password_hash: text.nullable(),
      ldap_entry_uuid: z.guid().optional(),
      ldap_maintainer_binding_id: id.optional(),
      active: z.boolean(),
      created_at: date,
      avatar_color: text.optional(),
      title: text.optional(),
      bio: text.optional(),
      email: text.optional(),
    })
    .refine((user) => (user.password_hash === null) === (user.ldap_entry_uuid !== undefined)),
  groups: z.strictObject({
    ...versioned,
    name: text,
    active: z.boolean(),
    ldap_entry_uuid: z.guid().optional(),
  }),
  memberships: z.strictObject({ ...base, user_id: id, group_id: id }),
  roles: z.strictObject({
    ...versioned,
    name: text,
    key: text.optional(),
    permissions: strings,
    builtin: z.boolean(),
  }),
  role_bindings: z.strictObject({
    ...base,
    principal_id: id,
    role_id: id,
    scope_type: scope,
    scope_id: text,
  }),
  sessions: z.strictObject({
    ...base,
    user_id: id,
    csrf: text,
    created_at: date,
    expires_at: integer,
    revoked_at: integer.nullable(),
    client: client.nullable(),
  }),
  tokens: z.strictObject({
    ...base,
    user_id: id,
    name: text,
    created_at: integer,
    revoked_at: integer.nullable(),
    scope: z.enum(['hub:read', 'hub:contribute']),
  }),
  cli_logins: z.strictObject({
    ...base,
    code: text,
    challenge: text,
    state: z.enum(['pending', 'approved', 'consumed']),
    expires_at: integer,
    user_id: id.optional(),
  }),
  install_tickets: z.strictObject({
    id: hash,
    user_id: z.uuid(),
    version_id: z.uuid(),
    credential: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('oauth'), id: z.uuid() }),
      z.strictObject({ kind: z.literal('personal'), id: hash }),
    ]),
    created_at: integer,
    expires_at: integer,
    consumed_at: integer.nullable(),
  }),
  login_attempts: z.strictObject({ ...base, failure_count: integer, window_expires_at: integer }),
  sources: z.discriminatedUnion('kind', [
    z.strictObject({ ...sourceBase, kind: z.literal('upload') }),
    z.strictObject({
      ...sourceBase,
      kind: z.literal('git'),
      provider: text,
      canonical_url: text,
      repository_identity: text,
      branch: text,
      credential_ref: id.nullable(),
      next_poll_at: integer,
      last_success_at: date.optional(),
      last_error_code: text.nullish(),
      last_observed_commit: text.optional(),
      last_observed_revision: revision.optional(),
    }),
  ]),
  assets: z.strictObject({
    ...versioned,
    slug: text,
    kind: z.enum(['skill', 'mcp']),
    requires_api_key: z.boolean().optional(),
    mcp_shared_keys: z.array(mcpSharedKey).optional(),
    mcp_key_revision: revision.optional(),
    source_id: id,
    owner_group_id: id,
    lifecycle: z.enum(['active', 'deprecated', 'blocked']),
    current_release_id: id.nullable(),
    created_at: date,
    deprecation_reason: text.optional(),
    replacement_asset_id: id.nullish(),
    source_missing_at: date.nullish(),
  }),
  bindings: z.strictObject({
    ...base,
    ...policy,
    source_id: id,
    asset_id: id,
    path: text,
    enabled: z.boolean(),
    retired_at: date.nullable(),
    applies_to: applicability,
    created_at: date,
    last_intake_id: id.optional(),
  }),
  intakes: z.strictObject({
    ...base,
    source_id: id,
    asset_id: id,
    requested_by: id,
    version_label: text,
    source_revision: revision,
    state: intakeState,
    phase: text,
    progress: z
      .array(
        z.strictObject({
          step: z.enum(['received', 'fetching', 'scanning', 'snapshot']),
          started_at: date,
        }),
      )
      .min(1),
    created_at: date,
    payload_ref: hash.optional(),
    filename: text.optional(),
    keywords: strings.optional(),
    requires_api_key: z.boolean().optional(),
    pending_mcp_key: mcpSharedKey.extend({ base_revision: revision }).optional(),
    binding_id: id.nullish(),
    source_sync_job_id: id.optional(),
    source_generation: integer.nullish(),
    origin_ref: text.optional(),
    origin_commit: text.optional(),
    origin_path: text.optional(),
    version_id: id.nullish(),
    content_digest: digest.nullish(),
    scan_run_id: id.nullish(),
    processing_ruleset: text.optional(),
    finished_at: date.nullish(),
    rescan_of: id.optional(),
    historical: z.boolean().optional(),
    error_code: text.nullish(),
    error_message: text.nullish(),
    retryable: z.boolean().optional(),
  }),
  versions: z.strictObject({
    ...base,
    asset_id: id,
    version_label: text,
    origin_source_id: id,
    origin_ref: text,
    origin_commit: text,
    origin_path: text,
    intake_id: id,
    content_digest: digest,
    artifact_digest: digest,
    manifest_ref: hash,
    artifact_ref: hash,
    manifest,
    files: z.array(manifestFile.extend({ blob_ref: hash })),
    metadata,
    availability: z.enum(['unreleased', 'released', 'revoked']),
    created_at: date,
  }),
  scans: z.strictObject({
    ...base,
    version_id: id,
    ruleset_version: text,
    scanner_version: text,
    state: z.enum(['passed', 'blocked']),
    findings: z.array(
      z.strictObject({
        id,
        rule_id: text,
        severity: z.enum(['block', 'warning', 'info']),
        file: text,
        line: integer,
        evidence_summary: text,
      }),
    ),
    finished_at: date,
  }),
  requests: z.strictObject({
    ...versioned,
    ...policy,
    proposed_scenarios: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(80),
          description: z.string().min(1).max(2000),
        }),
      )
      .max(20)
      .optional(),
    nomination: z.strictObject({ release_id: id, reason: text }).optional(),
    applies_to: applicability,
    requires_api_key: z.boolean().optional(),
    asset_id: id,
    version_id: id,
    source_intake_id: id,
    content_digest: digest,
    policy_source_id: id,
    source_revision: revision,
    source_consent: consent,
    scan_run_id: id,
    ruleset_version: text,
    approval_policy_digest: digest,
    base_release_id: id.nullable(),
    asset_revision: revision,
    canonical_policy_json: text,
    policy_digest: digest,
    historical: z.boolean(),
    state: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'stale']),
    submitted_by: id,
    created_at: date,
    stale_reason: text.optional(),
    decision_by: id.optional(),
    decision_reason: text.optional(),
    decided_at: date.optional(),
    accepted_warnings: z.array(z.strictObject({ finding_id: id, reason: text })).optional(),
  }),
  releases: z.strictObject({
    ...base,
    ...policy,
    applies_to: applicability,
    requires_api_key: z.boolean().optional(),
    asset_id: id,
    version_id: id,
    request_id: id,
    release_seq: revision,
    policy_source_id: id,
    source_revision: revision,
    policy_digest: digest,
    source_consent: consent,
    published_by: id,
    published_at: date,
  }),
  jobs: z.discriminatedUnion('kind', [
    z.strictObject({
      ...jobBase,
      kind: z.literal('ai_execution'),
      input: z.strictObject({ execution_id: id }),
    }),
    z.strictObject({ ...jobBase, kind: z.literal('intake'), input: z.strictObject({}) }),
    z.strictObject({
      ...jobBase,
      kind: z.literal('rescan'),
      input: z.strictObject({ version_id: id }),
    }),
    z.strictObject({
      ...jobBase,
      kind: z.literal('source_sync'),
      input: z.strictObject({
        requested_by: id,
        source_revision: revision,
        scheduled: z.boolean().optional(),
      }),
    }),
    z.strictObject({
      ...jobBase,
      kind: z.literal('catalog_prompt_refresh'),
      input: z.strictObject({ window_start: integer, profile_digest: hash }),
    }),
  ]),
  audit: z.strictObject({
    ...base,
    occurred_at: date,
    actor_id: id,
    action: text,
    entity_id: text,
    result: z.enum(['success', 'failure']),
    reason: text,
    metadata: jsonObject,
    actor: z
      .strictObject({
        kind: z.enum(['user', 'anonymous', 'system', 'unknown']),
        name: text,
        username: text.optional(),
      })
      .optional(),
    subject: subject.optional(),
  }),
  idempotency: z.strictObject({
    ...base,
    principal_id: id,
    route: text,
    key: text,
    request_hash: digest,
    response: z.unknown(),
    expires_at: integer,
  }),
  scenarios: z.strictObject({
    ...base,
    name: text,
    description: text,
    active: z.boolean(),
    revision: revision.optional(),
    merged_into: id.optional(),
  }),
  git_credentials: z.strictObject({
    ...versioned,
    user_id: id,
    name: text,
    host: text,
    kind: z.enum(['token', 'ssh']),
    username: text,
    auth_method: z.enum(['basic', 'bearer']),
    host_key: text,
    fingerprint: text.nullable(),
    host_fingerprint: text.nullable(),
    expires_at: date.nullable(),
    created_at: date,
    updated_at: date,
    revoked_at: date.nullable(),
    encrypted: encryptedCredential.nullable(),
  }),
  asset_feedback: z.strictObject({
    ...versioned,
    asset_id: id,
    version_id: id,
    submitted_by: id,
    request_key: text,
    request_hash: text,
    kind: z.enum(['defect', 'capability_gap', 'suggestion']),
    title: text,
    scenario: text,
    expected: text,
    actual: text,
    location: text,
    reproduction: text,
    evidence: text,
    suggestion: text,
    blocking: z.boolean(),
    status: z.enum(['pending', 'in_progress', 'resolved', 'declined']),
    resolution: text,
    fixed_version_id: id.nullable(),
    updated_by: id.nullable(),
    created_at: date,
    updated_at: date,
  }),
  hub_feedback: z
    .strictObject({
      ...versioned,
      number: revision,
      submitted_by: id,
      channel: z.enum(['web', 'cli']),
      kind: z.enum(['bug', 'ux', 'suggestion', 'question']),
      surface: z.enum(['web', 'cli', 'mcp', 'other']),
      area: z
        .enum(['discover', 'publish', 'review', 'connect', 'account', 'operations', 'other'])
        .nullable(),
      title: text.min(1).max(120),
      description: text.max(5000),
      steps: text.max(3000),
      expected: text.max(2000),
      blocking: z.boolean(),
      status: hubFeedbackStatus,
      decline_reason: hubFeedbackDeclineReason.nullable(),
      duplicate_of_id: id.nullable(),
      assignee_id: id.nullable(),
      diagnostics: hubFeedbackJson.nullable(),
      submission: hubFeedbackJson,
      description_redacted_at: date.nullable(),
      created_at: date,
      updated_at: date,
      closed_at: date.nullable(),
      last_activity_at: date,
      last_submitter_activity_at: date,
      last_handler_public_at: date.nullable(),
      submitter_seen_at: date,
    })
    .refine(
      (row) =>
        (row.closed_at !== null) === (row.status === 'resolved' || row.status === 'declined') &&
        (row.decline_reason !== null) === (row.status === 'declined') &&
        (row.duplicate_of_id !== null) === (row.decline_reason === 'duplicate'),
      '反馈状态与结束信息不一致',
    ),
  hub_feedback_events: z.strictObject({
    ...base,
    feedback_id: id,
    sequence: revision,
    actor_id: id.nullable(),
    actor_role: z.enum(['submitter', 'handler', 'system']),
    kind: z.enum(['comment', 'status', 'assignment', 'attachment_removed', 'redaction']),
    visibility: z.enum(['public', 'internal']),
    body: text.max(5000),
    status_from: hubFeedbackStatus.nullable(),
    status_to: hubFeedbackStatus.nullable(),
    decline_reason: hubFeedbackDeclineReason.nullable(),
    attachment_ids: z.array(id).max(5),
    redacted_at: date.nullable(),
    created_at: date,
  }),
  hub_feedback_attachments: z
    .strictObject({
      ...base,
      feedback_id: id,
      event_id: id.nullable(),
      uploaded_by: id,
      kind: z.enum(['screenshot', 'image', 'text', 'json']),
      media_type: z.enum([
        'image/png',
        'image/jpeg',
        'image/webp',
        'text/plain',
        'application/json',
      ]),
      name: text.min(1).max(120),
      size: revision.max(5 * 1024 * 1024),
      width: revision.max(8192).nullable(),
      height: revision.max(8192).nullable(),
      sha256: hash.nullable(),
      created_at: date,
      removed_at: date.nullable(),
      removed_by: id.nullable(),
      removal_reason: z.enum(['submitter', 'handler', 'retention']).nullable(),
    })
    .refine(
      (row) =>
        row.sha256 === null
          ? row.removed_at !== null &&
            row.removal_reason !== null &&
            (row.removed_by === null) === (row.removal_reason === 'retention')
          : row.removed_at === null && row.removed_by === null && row.removal_reason === null,
      '附件引用与移除信息不一致',
    ),
  recommendations: z.strictObject({ ...base, user_id: id, asset_id: id, created_at: date }),
  catalog_prompts: z
    .strictObject({
      id: z.literal('catalog-prompts'),
      next_refresh_at: integer,
      active_job_id: promptId.nullable(),
      window: z
        .strictObject({
          start: integer,
          job_id: promptId,
          reserved: integer.max(20),
          deadline: integer.nullable(),
        })
        .nullable(),
      cursor: hash.nullable(),
      batches: z.array(promptBatch).max(200),
      updated_at: date,
    })
    .refine(
      (state) =>
        (state.active_job_id === null) === (state.window === null) &&
        (state.window === null || state.window.job_id === state.active_job_id) &&
        new Set(state.batches.map((batch) => batch.audience_signature)).size ===
          state.batches.length &&
        new Set(state.batches.flatMap((batch) => batch.prompts.map((p) => p.suggestion_ref)))
          .size === state.batches.reduce((total, batch) => total + batch.prompts.length, 0),
      '提示调度状态或批次不一致',
    ),
} satisfies { [K in TableName]: z.ZodType<RecordMap[K]> };

/**
 * 记录进出存储前的唯一校验入口：`strictObject` 会拒绝多余字段，因此未登记的字段不会静默落库或回灌。
 * 校验失败抛 `ZodError`，HTTP 层统一转成 422 `VALIDATION_ERROR`。
 *
 * @param table - 目标表名，决定采用哪份 schema
 * @param value - 待校验的原始记录（来自数据库 JSON 或外部输入）
 * @returns 已剔除类型的记录，字段与 `RecordMap` 对齐
 */
export function parseRecord<K extends TableName>(table: K, value: unknown): RecordMap[K] {
  return schemas[table].parse(value) as RecordMap[K];
}
