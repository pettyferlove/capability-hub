import {
  emptyStyles,
  tagStyles,
  tagTealStyles,
  textBtnStyles,
  dangerTextStyles,
  spinStyles,
} from '../../shared/styles/recipes.js';
import {
  sessionListStyles,
  sessionItemStyles,
  sessionDeviceIconStyles,
  sessionContentStyles,
  sessionTitleStyles,
  sessionDeviceStyles,
  sessionTimesStyles,
  sessionActionStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import type { SessionResponse } from '@capability-hub/contracts/http';
import {
  Globe,
  Laptop,
  LoaderCircle,
  LogOut,
  Smartphone,
  Tablet,
} from '../../shared/icons/lucide.js';
import { dateLabel } from '../../shared/format/labels.js';

function browserLabel(session: SessionResponse) {
  const client = session.client;
  if (!client?.browser_name) return client ? '未识别的浏览器' : '网页会话';
  return [client.browser_name, client.browser_version?.split('.')[0]].filter(Boolean).join(' ');
}

/**
 * 登录会话列表：当前会话只打标不提供退出按钮，避免误把正在使用的会话踢掉；
 * 撤销交给 `onRevoke`；`pendingId` 非空时所有行的退出按钮都被禁用（被点的那行显示进行中），
 * 保证同一时间只有一次撤销请求在途。浏览器与系统信息缺失时降级为「未记录」而不是留空。
 */
export function SessionList({
  sessions,
  pendingId,
  onRevoke,
}: {
  sessions: SessionResponse[];
  pendingId: string | null;
  onRevoke: (id: string) => void;
}) {
  if (!sessions.length) return <p className={emptyStyles}>暂无有效会话</p>;
  return (
    <ul className={sessionListStyles} aria-label="有效登录会话">
      {sessions.map((session) => {
        const client = session.client;
        const DeviceIcon =
          client?.device_type === 'mobile'
            ? Smartphone
            : client?.device_type === 'tablet'
              ? Tablet
              : client?.device_type === 'desktop'
                ? Laptop
                : Globe;
        const deviceLabel = client
          ? [
              client.os_name,
              { desktop: '电脑', mobile: '手机', tablet: '平板', unknown: '' }[client.device_type],
            ]
              .filter(Boolean)
              .join(' · ') || '系统未识别'
          : '浏览器信息未记录';
        const title = browserLabel(session);
        const pending = pendingId === session.id;
        return (
          <li className={sessionItemStyles} data-current={session.current} key={session.id}>
            <span className={sessionDeviceIconStyles} aria-hidden="true">
              <DeviceIcon size={19} />
            </span>
            <div className={sessionContentStyles}>
              <div className={sessionTitleStyles}>
                <strong
                  title={[client?.browser_name, client?.browser_version].filter(Boolean).join(' ')}
                >
                  {title}
                </strong>
                {session.current && <span className={cn(tagStyles, tagTealStyles)}>当前会话</span>}
              </div>
              <p className={sessionDeviceStyles}>{deviceLabel}</p>
              <dl className={sessionTimesStyles}>
                <div>
                  <dt>登录</dt>
                  <dd>
                    <time dateTime={session.created_at}>{dateLabel(session.created_at)}</time>
                  </dd>
                </div>
                <div>
                  <dt>到期</dt>
                  <dd>
                    <time dateTime={new Date(session.expires_at).toISOString()}>
                      {dateLabel(session.expires_at)}
                    </time>
                  </dd>
                </div>
              </dl>
            </div>
            {!session.current && (
              <button
                type="button"
                className={cn(textBtnStyles, dangerTextStyles, sessionActionStyles)}
                aria-label={'退出' + title + '的登录会话'}
                disabled={pendingId !== null}
                onClick={() => onRevoke(session.id)}
              >
                {pending ? <LoaderCircle size={14} className={spinStyles} /> : <LogOut size={14} />}
                {pending ? '正在退出…' : '退出登录'}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
