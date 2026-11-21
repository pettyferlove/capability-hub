import { isCatalogPromptText } from '@capability-hub/domain/models';
import { secretFindings } from '@capability-hub/infrastructure/content/secret-detection';

const credential = String.raw`(?:api\s*key|key|密钥|秘钥|令牌|token|密码|口令|凭据|凭证|cookie|私钥|secret|证书)`;
const stop = String.raw`[^，。？?！!；;]`;
const unsafePatterns = [
  // 链接不进开场提示，避免把访客引向目录外。
  /(?:https?:\/\/|ftp:\/\/|www\.)/iu,
  // 索要访客自己的凭据或其原文。
  new RegExp(
    String.raw`(?:贴|粘贴|发给|发送|发来|提供|告诉|给出|附上|填入|填写|输入|上传)(?:一下)?(?:你|您)(?:们)?(?:的)?${stop}{0,12}${credential}`,
    'iu',
  ),
  new RegExp(
    String.raw`把(?:你|您)(?:们)?(?:的)?${stop}{0,12}${credential}${stop}{0,8}(?:贴|粘贴|发|给|提供|告诉|上传|填)`,
    'iu',
  ),
  new RegExp(String.raw`${credential}\s*(?:的)?\s*(?:原文|明文)`, 'iu'),
  // 要求上传内部文件。
  new RegExp(
    String.raw`(?:上传|发送|发给|提交|附上|贴出|粘贴|分享)(?:一下)?(?:你|您)?(?:们)?(?:的)?${stop}{0,8}(?:内部|公司|私有|机密|保密)${stop}{0,8}(?:文件|文档|代码|资料|数据|日志|配置)`,
    'u',
  ),
  // 要求执行外部命令；只拦截命令本身或指向一段命令的说法，不拦截“怎样运行测试”这类提问。
  new RegExp(
    String.raw`(?:执行|运行|跑一下|输入)(?:以下|下面|这条|这个|该|如下)(?:的)?(?:命令|指令|脚本)|\x60|\$\s|(?:^|\s)(?:curl|wget|sudo|rm\s+-|bash\s|sh\s+-c|powershell|npx\s|npm\s+(?:i|install)\b|pip\s+install)`,
    'iu',
  ),
];

/**
 * 开场提示只描述目标、阻碍或预期结果。带链接、带凭据原文，或要求访客交出凭据、
 * 上传内部文件、执行外部命令的候选直接舍弃，不进入预检、存储或展示；
 * 出现 Key、文件或命令名称本身不是拒绝理由。
 */
export function unsafePrompt(prompt: { label: string; text: string }) {
  const text = `${prompt.label}\n${prompt.text}`;
  return (
    !isCatalogPromptText(text) ||
    unsafePatterns.some((pattern) => pattern.test(text)) ||
    !secretFindings(text).next().done
  );
}
