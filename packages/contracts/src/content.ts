import { z } from 'zod';
export interface ManifestFile {
  path: string;
  size: number;
  sha256: string;
  executable: boolean;
}
export interface Manifest {
  schema_version: 1;
  kind: 'skill' | 'mcp';
  files: ManifestFile[];
}
export interface Finding {
  id: string;
  rule_id: string;
  severity: 'block' | 'warning' | 'info';
  file: string;
  line: number;
  evidence_summary: string;
}

/** 使用清单字段和计算规范摘要前先校验结构。 */
export const manifestFileSchema = z
  .object({
    path: z.string(),
    size: z
      .number()
      .int()
      .min(0)
      .max(10 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    executable: z.boolean(),
  })
  .strict();
export const manifestSchema = z
  .object({
    schema_version: z.literal(1),
    kind: z.enum(['skill', 'mcp']),
    files: z.array(manifestFileSchema).min(1).max(500),
  })
  .strict();

export interface Applicability {
  languages?: string[];
  frameworks?: string[];
  keywords?: string[];
}

export interface ContentMetadata {
  name: string;
  description: string;
  applies_to?: Applicability;
  frontmatter?: Record<string, unknown>;
  has_scripts?: boolean;
  has_archives?: boolean;
  server_json?: Record<string, unknown>;
  schema_id?: string;
  schema_digest?: string;
  installation_options?: InstallationOption[];
  declared_tools?: string[];
  tools_verified?: boolean;
}

export interface InstallationInput {
  value?: string;
  isSecret?: boolean;
  isRequired?: boolean;
  variables?: Record<string, unknown>;
}
export interface InputVariable extends InstallationInput {
  name: string;
}
export type InstallationArgument = InstallationInput &
  ({ type: 'named'; name: string } | { type: 'positional' });

export interface InstallationOption {
  option_id: string;
  kind: 'remote' | 'package';
  supported: boolean;
  type?: string;
  url?: string;
  variables?: Record<string, unknown>;
  headers?: InputVariable[];
  registryType?: string;
  identifier?: string;
  version?: string;
  transport?: { type: string };
  runtimeArguments?: InstallationArgument[];
  packageArguments?: InstallationArgument[];
  environmentVariables?: InputVariable[];
}

export type AssetKind = 'skill' | 'mcp';
