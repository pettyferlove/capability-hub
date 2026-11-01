/**
 * 客户端配置生成结果，出现在接入向导与 `hub-mcp-config` 接口。
 * `config`/`text` 是同内容的两种形态；`runtime_client_verification` 恒为 `false`，
 * 因为生成配置不代表已连接，界面不得据此宣称接入成功。
 */
export interface ClientConfigurationResponse {
  version_id: string;
  installation_option_id: string;
  client: string;
  scope: string;
  config: Record<string, unknown>;
  text: string;
  target_file: string;
  required_variables: { name: string; secret: boolean; instruction: string }[];
  notes: string[];
  runtime_client_verification: false;
}
