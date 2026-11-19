import { AlertTriangle } from '../icons/lucide.js';
import { btnStyles, monoStyles, subtleStyles } from '../styles/recipes.js';
import { DialogTitle } from './DialogTitle.js';
import { Message } from './Message.js';
import { Overlay } from './Overlay.js';
import { Submit } from './Submit.js';

/** 确认框只接收绑定信息，不接收凭据原值。 */
export interface McpSharingDetails {
  asset: string;
  url: string;
  name: string;
  scheme?: 'bearer';
  action: 'upload' | 'save' | 'replace';
}

/** 新录入和维护使用同一领取范围提示，确认操作只作用于已展示的目标。 */
export function McpSharingConfirmation({
  details,
  onCancel,
  onConfirm,
}: {
  details: McpSharingDetails;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const title = details.action === 'replace' ? '确认替换共享凭据' : '确认共享凭据';
  return (
    <Overlay open onClose={onCancel} variant="palette" label={title}>
      <DialogTitle title={title} onClose={onCancel} />
      <div className="space-y-3.5 px-6.5 py-5 max-[600px]:p-[17px]">
        <p className="[overflow-wrap:anywhere]">
          安装 <strong>{details.asset}</strong> 后，客户端会按以下配置发送
          {details.scheme === 'bearer' ? '团队 Bearer Token' : ' API Key'}。
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl border border-line bg-page px-3.5 py-2.5 text-label">
          <dt className="text-muted-ink">服务地址</dt>
          <dd className={monoStyles}>{details.url}</dd>
          <dt className="text-muted-ink">请求头</dt>
          <dd className={monoStyles}>{details.name}</dd>
        </dl>
        {details.url.startsWith('http:') && (
          <p className="flex items-start gap-2 text-label text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>该地址使用 HTTP，客户端发送凭据时连接未经加密。</span>
          </p>
        )}
        <Message>
          已登录且有该版本读取权限的人可以在安装配置中查看、复制真实凭据。版本公开时，任何已登录用户都可以领取。
        </Message>
        <p className={subtleStyles}>
          {details.action === 'upload'
            ? '版本审核通过后，本次录入的共享凭据才会生效。'
            : details.action === 'replace'
              ? '替换后，已安装的用户需要重新获取配置。旧凭据须在目标服务撤销。'
              : '保存后，此资产中使用相同地址、请求头和认证方式的版本会在安装配置中提供这个凭据。'}
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2.5 border-t border-line px-6.5 py-4 max-[600px]:px-[17px]">
        <button type="button" className={btnStyles} onClick={onCancel}>
          取消
        </button>
        <Submit type="button" onClick={onConfirm}>
          {details.action === 'upload'
            ? '确认共享并提交校验'
            : details.action === 'replace'
              ? '确认替换共享凭据'
              : '确认保存共享凭据'}
        </Submit>
      </div>
    </Overlay>
  );
}
