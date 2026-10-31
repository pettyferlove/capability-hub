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
