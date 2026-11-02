/**
 * 发布入口页，按 `?tab=` 在「添加资产」{@link UploadPanel}、「Git 同步」{@link SourcesPanel} 与
 * 「维护资产」{@link ManagementPanel} 三个通道间切换，未知 tab 一律回退到上传。
 */
import { publishPageStyles } from './styles.js';
import { pageContentStyles } from '../../shared/styles/recipes.js';
import { GitBranch, ShieldCheck, UploadCloud } from '../../shared/icons/lucide.js';
import { Message } from '../../shared/components/Message.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { useHub } from '../../shared/context/HubContext.js';
import { pageHref } from '../../shared/navigation/history-route.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import ManagementPanel from '../catalog/ManagementPanel.js';
import SourcesPanel from '../sources/SourcesPanel.js';
import { UploadPanel } from './UploadPanel.js';

/**
 * 发布页容器：只负责 tab 解析、`can_publish` 权限拦截与面板挂载，不持有表单状态。切换 tab 时内容区
 * 按 `key` 重挂载，避免上一通道的输入残留。
 */
export default function PublishPage({ query = location.search }: { query?: string }) {
  const { me } = useHub();
  const params = new URLSearchParams(query);
  const requested = params.get('tab');
  const tab = requested && ['upload', 'git', 'manage'].includes(requested) ? requested : 'upload';
  return (
    <div className={publishPageStyles}>
      <PageHead
        eyebrow={tab === 'git' ? 'REPOSITORY SYNC' : 'CONTRIBUTE TO YOUR TEAM'}
        title={tab === 'git' ? 'Git 同步' : '分享 Skill 与 MCP'}
        description={
          tab === 'git'
            ? '从指定分支读取 Skill 目录或 MCP 描述文件，校验后提交审核。'
            : '从文件、服务地址或安装命令开始，校验后提交审核。'
        }
      />
      <PageTabs
        label="发布方式"
        panelId="publish-channel"
        value={tab}
        onValueChange={(value) => {
          navigate(pageHref('publish', { tab: value === 'upload' ? undefined : value }));
        }}
        items={[
          {
            id: 'upload',
            label: (
              <>
                <UploadCloud size={17} />
                添加资产
              </>
            ),
          },
          {
            id: 'git',
            label: (
              <>
                <GitBranch size={17} />
                Git 同步
              </>
            ),
          },
          {
            id: 'manage',
            label: (
              <>
                <ShieldCheck size={17} />
                维护资产
              </>
            ),
          },
        ]}
      />
      <div
        role="tabpanel"
        id={'publish-channel-' + tab}
        aria-labelledby={'publish-channel-tab-' + tab}
        tabIndex={0}
      >
        <div className={pageContentStyles} key={tab}>
          {tab === 'manage' ? (
            <ManagementPanel />
          ) : !me?.capabilities.can_publish ? (
            <Message>当前账号没有资产创建或维护权限，请联系管理员授权。</Message>
          ) : tab === 'upload' ? (
            <UploadPanel
              key={(params.get('asset') ?? '') + ':' + (params.get('intake') ?? '')}
              initialAssetId={params.get('asset') ?? ''}
              initialIntakeId={params.get('intake') ?? ''}
            />
          ) : (
            <SourcesPanel />
          )}
        </div>
      </div>
    </div>
  );
}
