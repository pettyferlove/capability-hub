import { btnStyles, formActionsStyles } from '../styles/recipes.js';
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
      <div className="space-y-4 px-5 pb-5">
        <p>
          安装 <strong>{details.asset}</strong> 后，客户端会通过 <code>{details.name}</code>{' '}
          请求头将
          {details.scheme === 'bearer' ? '团队 Bearer Token' : 'API Key'} 发送至{' '}
          <code className="break-all">{details.url}</code>。
        </p>
        <Message>
          已登录且有该版本读取权限的人可以在安装配置中查看、复制真实凭据。版本公开时，任何已登录用户都可以领取。
        </Message>
        <p>
          {details.action === 'upload'
            ? '本次录入随版本审核通过后生效。'
            : details.action === 'replace'
              ? '替换后，已安装的用户需要重新获取配置。旧凭据须在目标服务撤销。'
              : '保存后，此资产中使用相同地址、请求头和认证方式的版本会在安装配置中提供这个凭据。'}
        </p>
        {details.url.startsWith('http:') && <p>该地址使用 HTTP，客户端发送凭据时连接未经加密。</p>}
        <div className={formActionsStyles}>
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
      </div>
    </Overlay>
  );
}
