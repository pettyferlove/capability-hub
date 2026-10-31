import { publishPageStyles } from './styles.js';
import { pageContentStyles } from '../../shared/styles/recipes.js';
import { GitBranch, ShieldCheck, UploadCloud } from '../../shared/icons/lucide.js';
import { Message } from '../../shared/components/Message.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { useHub } from '../../shared/context/HubContext.js';
import { pageHref, parseHistoryRoute } from '../../shared/navigation/history-route.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import ManagementPanel from '../catalog/ManagementPanel.js';
import SourcesPanel from '../sources/SourcesPanel.js';
import { UploadPanel } from './UploadPanel.js';
export default function PublishPage() {
  const { me } = useHub();
  const requested = new URLSearchParams(
    parseHistoryRoute(location.pathname, location.search).query,
  ).get('tab');
  const tab = requested && ['upload', 'git', 'manage'].includes(requested) ? requested : 'upload';
  return (
    <div className={publishPageStyles}>
      <PageHead
        eyebrow="CONTRIBUTE TO YOUR TEAM"
        title="分享 Skill 与 MCP"
        description="从文件、服务地址或安装命令开始，校验后提交审核。"
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
            <UploadPanel />
          ) : (
            <SourcesPanel />
          )}
        </div>
      </div>
    </div>
  );
}
