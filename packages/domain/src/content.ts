import type { Buffer } from 'node:buffer';
/** 扫描与归档使用的字节文件；不属于浏览器传输契约。 */
export interface ContentFile {
  path: string;
  bytes: Buffer;
  executable: boolean;
}

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

export interface ContentInspection {
  files: ContentFile[];
  manifest: Manifest;
  content_digest: string;
  metadata: ContentMetadata;
  findings: Finding[];
  state: 'passed';
}
export const contentScanRuleset = '2026-10-31.2';

export type AssetKind = 'skill' | 'mcp';
