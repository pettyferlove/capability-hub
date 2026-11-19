import { AsyncLocalStorage } from 'node:async_hooks';
import { cliCompatibility, hubVersionHeaders } from '@capability-hub/contracts';
import { compareVersionLabels, isFixedVersionLabel } from '@capability-hub/domain/version-labels';
import packageJson from '../package.json' with { type: 'json' };

const notices = new AsyncLocalStorage<{ checked: boolean; text?: string }>();

/** 同一命令的 OAuth、MCP 和资源请求共用一个提示；无命令作用域时不记录。 */
export async function withCliUpdateNotice<T>(action: () => Promise<T>): Promise<T> {
  if (process.env.CAPABILITY_HUB_NO_UPDATE_NOTICE === '1') return await action();
  const notice: { checked: boolean; text?: string } = { checked: false };
  try {
    return await notices.run(notice, action);
  } finally {
    if (notice.text) process.stderr.write(notice.text + '\n');
  }
}

/** 响应头只提供版本阈值，升级链接必须使用本次请求的 Hub。 */
export function observeCliResponse(origin: string, response: Response): void {
  const notice = notices.getStore();
  if (!notice || notice.checked) return;
  const value = response.headers.get(hubVersionHeaders.cli);
  const match = value && /^recommended=([^,\s]+),[ \t]*minimum=([^,\s]+)$/.exec(value);
  if (!match) return;
  const [, recommended, minimum] = match;
  if (
    !isFixedVersionLabel(recommended) ||
    !isFixedVersionLabel(minimum) ||
    compareVersionLabels(minimum, recommended) > 0
  )
    return;
  notice.checked = true;
  const current = packageJson.version;
  if (compareVersionLabels(current, recommended) >= 0) return;
  const upgrade = `升级方法：${new URL('/connect/cli', origin).href}`;
  if (compareVersionLabels(current, minimum) < 0) {
    const reason =
      minimum === cliCompatibility.minimum
        ? cliCompatibility.minimum_reason
        : '此 Hub 下发的部分命令需要该版本';
    notice.text = `警告：capability-hub ${current} 低于此 Hub 要求的 ${minimum}：${reason}。${upgrade}`;
  } else {
    notice.text = `提示：此 Hub 推荐 capability-hub ${recommended}，当前 ${current}。${upgrade}`;
  }
}
