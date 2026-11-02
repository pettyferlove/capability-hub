/** Git 仅在目标 HTTPS 主机请求认证时读取凭据，令牌不进入命令行或临时脚本。 */
export function basicGitCredentials(host: string, username: string, token: string) {
  const helper =
    '!f() { if test "$1" = get; then ' +
    'printf \'username=%s\\npassword=%s\\n\' "$CAPABILITY_GIT_USERNAME" "$CAPABILITY_GIT_TOKEN"; fi; }; f';
  return {
    config: `credential.https://${host}/.helper=${helper}`,
    env: { CAPABILITY_GIT_USERNAME: username, CAPABILITY_GIT_TOKEN: token },
  };
}
