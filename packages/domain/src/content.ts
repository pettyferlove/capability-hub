import type { Buffer } from 'node:buffer';

/** 扫描与归档使用的字节文件；不属于浏览器传输契约。 */
export interface ContentFile {
  path: string;
  bytes: Buffer;
  executable: boolean;
}

/**
 * 清单条目，是内容寻址与安装校验的唯一依据。
 */
export interface ManifestFile {
  /** 归档内相对路径，已通过 `safePath` 校验；禁止 `..`、绝对路径与 Windows 保留名。 */
  path: string;
  /** 单文件字节数；单文件上限 10 MiB、整包上限 100 MiB，超出在上传阶段即拒绝。 */
  size: number;
  /** 小写十六进制 SHA-256，安装端据此校验解包后的内容。 */
  sha256: string;
  /** 是否补可执行位；判定见 {@link executableText}，不采信 ZIP 里的权限标记。 */
  executable: boolean;
}

/**
 * 归档清单。`files` 必须按 `path` 的 UTF-8 字节序排列，且排除打包元数据，
 * 因为 `content_digest` 就是本结构经 {@link canonical} 序列化后的摘要——顺序或多余条目变化都会被判成新内容。
 */
export interface Manifest {
  /** 清单结构版本，目前只接受 1；升级必须同时兼容读取旧版本。 */
  schema_version: 1;
  kind: 'skill' | 'mcp';
  files: ManifestFile[];
}

/**
 * 静态扫描命中项。`severity` 为 `block` 的命中会阻止发布，`warning` 需要审核者逐条确认，
 * `info` 只作提示；`evidence_summary` 是给人看的短文，不承载可机读数据（机读请用 `rule_id`）。
 */
export interface Finding {
  id: string;
  rule_id: string;
  severity: 'block' | 'warning' | 'info';
  file: string;
  line: number;
  evidence_summary: string;
}

/**
 * 适用范围提示，只影响检索与推荐排序，不参与访问控制。
 */
export interface Applicability {
  languages?: string[];
  frameworks?: string[];
  keywords?: string[];
}

/**
 * 从内容中提取并冻结到版本记录上的元数据；`name`/`description` 来自 SKILL.md 头或 server.json，
 * 之后展示端只读这份快照，不再回读归档，因此改内容必须发新版本。
 */
export interface ContentMetadata {
  name: string;
  description: string;
  applies_to?: Applicability;
  /** SKILL.md 的原始 frontmatter，保留未识别字段供前端展示，不参与摘要计算。 */
  frontmatter?: Record<string, unknown>;
  /** 扫描时是否发现可执行文件；用于安装前提示，不影响分发判定。 */
  has_scripts?: boolean;
  /** 扫描时是否发现内嵌归档；归档内容不会被展开检查，需人工确认。 */
  has_archives?: boolean;
  /** MCP 的 server.json 原文，安装端据此生成客户端配置。 */
  server_json?: Record<string, unknown>;
  /** 命中过的 MCP schema 标识；与 `schema_digest` 一起用于判断是否需要重新校验。 */
  schema_id?: string;
  /** 校验时所用 schema 的 `sha256:` 摘要，schema 变即视为需要重新校验。 */
  schema_digest?: string;
  /** 可供用户选择的安装方式，至少一个；`supported` 为 false 的项仍需展示以说明原因。 */
  installation_options?: InstallationOption[];
  /** 声明的工具名列表；与服务器实际暴露的工具比对后才能置 `tools_verified`。 */
  declared_tools?: string[];
  tools_verified?: boolean;
}

/**
 * 安装项中的输入定义；只保留生成客户端配置所需的字段，因此不含任何服务端状态。
 */
export interface InstallationInput {
  /** 默认值；缺省时由客户端向用户收集，而不是在服务端补齐。 */
  value?: string;
  /** 秘密值不得回显，也不写入分享链接、日志或审计详情。 */
  isSecret?: boolean;
  /** 必填项，缺失时整个安装项不可用。 */
  isRequired?: boolean;
  /** 变量替换映射，供客户端拼接配置文本使用。 */
  variables?: Record<string, unknown>;
}

/**
 * 具名输入变量（请求头或环境变量），`name` 同时决定客户端配置里的键名。
 */
export interface InputVariable extends InstallationInput {
  name: string;
}

/**
 * 安装参数：`named` 带参数名，`positional` 按声明顺序占位，两者不可互换。
 */
export type InstallationArgument = InstallationInput &
  ({ type: 'named'; name: string } | { type: 'positional' });

/**
 * 一条可供选择的安装方式（远程 URL 或包管理器）。`kind` 决定读取哪组字段：
 * `remote` 用 `url`/`headers`，`package` 用 `registryType`/`identifier`/`version` 与启动参数；
 * `supported` 为 false 时仍要保留条目，让用户看到「为何不能选」；当前只有 transport 为 `streamable-http`
 * 的远程项、以及 `npm` 且版本为固定 semver 的包项会被置为 true。
 */
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

/**
 * 一次内容检查的完整结论；扫描在此停下，是否入库由调用方在同一流程后续决定。
 * `content_digest` 由 `manifest` 经规范化序列化得出，重复导入同一内容会得到相同摘要，用于去重与版本比对。
 */
export interface ContentInspection {
  files: ContentFile[];
  manifest: Manifest;
  content_digest: string;
  metadata: ContentMetadata;
  findings: Finding[];
  /** 只有检查通过才会返回结论，因此目前只有 `passed` 一个取值；类型保持字面量以便将来收紧。 */
  state: 'passed';
}

/**
 * 规则集的版本标识，会写入发布请求与扫描记录。规则变化即换版本号，
 * 这样历史版本的「当时扫过什么」可复现，重新扫描也能判断是否需要。
 */
export const contentScanRuleset = '2026-10-31.2';

/**
 * 资产类型：`skill` 是整包分发的文档与脚本，`mcp` 是单个 `server.json` 描述的服务器接入定义。
 */
export type AssetKind = 'skill' | 'mcp';
