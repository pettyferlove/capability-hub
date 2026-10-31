export interface SetupCommand {
  username: string;
  password: string;
  display_name: string;
  team_name: string;
}
export interface IssueTokenCommand {
  name: string;
  scope?: 'hub:read' | 'hub:contribute';
}
export interface CliLoginCommand {
  challenge: string;
}
export interface ApproveCliLoginCommand {
  code: string;
}
export interface PollCliLoginQuery {
  device_code: string;
  verifier: string;
}
