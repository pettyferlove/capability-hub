import { z } from 'zod';
/** 清单文件项，出现在版本快照响应（{@link VersionSnapshotResponse}）与下载清单里。 */
export interface ManifestFile {
  /** 归档内相对路径；安装端据此还原目录，禁止 `..` 与绝对路径。 */
  path: string;
  /** 单文件字节数，上限 10 MiB；超出接收阶段即拒绝。 */
  size: number;
  /** 小写十六进制 SHA-256，用于校验解包后内容。 */
  sha256: string;
  /** 可执行位；解包时需按此还原而非按扩展名推测。 */
  executable: boolean;
}
/** 版本内容清单：文件数 1–500，路径与摘要的完整性由 {@link manifestSchema} 校验。 */
export interface Manifest {
  schema_version: 1;
  kind: 'skill' | 'mcp';
  files: ManifestFile[];
}
/** 扫描发现项，出现在 {@link ScanResponse} 与发布审核详情；`block` 级阻断发布，`warning` 需审核人逐条给出接受理由。 */
export interface Finding {
  id: string;
  rule_id: string;
  severity: 'block' | 'warning' | 'info';
  file: string;
  line: number;
  /** 脱敏后的证据摘要，不保留命中的原文片段。 */
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
/**
 * 版本清单：`schema_version` 固定为 1，文件数 1–500，逐项复用 {@link manifestFileSchema} 的大小与摘要上限。
 * 严格模式拒绝未知字段，保证清单摘要在接收端与安装端算出一致结果。
 */
export const manifestSchema = z
  .object({
    schema_version: z.literal(1),
    kind: z.enum(['skill', 'mcp']),
    files: z.array(manifestFileSchema).min(1).max(500),
  })
  .strict();

/** 检索维度：来自 Skill frontmatter 或发布时填写，未归一化的空数组按未提供处理。 */
export interface Applicability {
  languages?: string[];
  frameworks?: string[];
  keywords?: string[];
}

/** 版本内容元数据，出现在版本快照响应；Skill 取自 frontmatter，MCP 取自 server.json。 */
export interface ContentMetadata {
  name: string;
  description: string;
  applies_to?: Applicability;
  frontmatter?: Record<string, unknown>;
  has_scripts?: boolean;
  has_archives?: boolean;
  /** MCP 的原始 server.json，官方字段超出安装选项投影范围时以此为准。 */
  server_json?: Record<string, unknown>;
  /** server.json 校验所用 schema 的标识；摘要变化即要求重新扫描。 */
  schema_id?: string;
  schema_digest?: string;
  /** 已校验的安装选项，仅 MCP 存在；至少一项，否则接收阶段即拒绝。 */
  installation_options?: InstallationOption[];
  declared_tools?: string[];
  /** 工具是否经实测；上架时先为 false，只有实测后才可置真。 */
  tools_verified?: boolean;
}

/** 安装项中的输入定义；只保留生成客户端配置所需的字段。 */
export interface InstallationInput {
  /** 默认值，缺省时由客户端向用户收集。 */
  value?: string;
  /** 秘密值不得回显，也不写入分享链接或日志。 */
  isSecret?: boolean;
  /** 必填项，缺失时该安装项不可用。 */
  isRequired?: boolean;
  /** 变量替换映射，供客户端拼接配置文本使用。 */
  variables?: Record<string, unknown>;
}
/** 具名输入变量（header 或环境变量），变量名同时决定客户端配置里的键。 */
export interface InputVariable extends InstallationInput {
  name: string;
}
/** 安装参数：`named` 带参数名，`positional` 按声明顺序占位。 */
export type InstallationArgument = InstallationInput &
  ({ type: 'named'; name: string } | { type: 'positional' });

/** MCP 的一个安装选项；`option_id` 在版本内按序号生成（如 `remote-1`），用于稳定引用。 */
export interface InstallationOption {
  option_id: string;
  kind: 'remote' | 'package';
  /** 当前实现是否支持该选项：远端仅 `streamable-http`，包仅 npm 且版本必须固定。 */
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

/** {@link assetKindSchema} 的输出侧类型，供前端判别资源类型。 */
export type AssetKind = 'skill' | 'mcp';
