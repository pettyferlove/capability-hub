import { accountPageStyles } from './styles.js';
import { pageContentStyles } from '../../shared/styles/recipes.js';
import {
  Activity,
  KeyRound,
  ScrollText,
  ShieldCheck,
  UserRound,
  UsersRound,
} from '../../shared/icons/lucide.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { useHub } from '../../shared/context/HubContext.js';
import { GitCredentialsPanel } from '../profile/GitCredentialsPanel.js';
import { PersonalProfile } from '../profile/PersonalProfile.js';
import { PersonalSecurity } from '../profile/SecurityPanel.js';
import { AdministrationPanel } from './AdministrationPanel.js';
import { AuditPanel } from './AuditPanel.js';
import { OperationsPanel } from './OperationsPanel.js';
export default function AccountPage({ query = location.search }: { query?: string }) {
  const { me } = useHub();
  const requested = new URLSearchParams(query).get('tab') ?? 'profile';
  const allowed = [
    'profile',
    'credentials',
    'security',
    ...(me?.capabilities.can_admin ? ['identity', 'roles'] : []),
    ...(me?.capabilities.can_audit ? ['audit', 'operations'] : []),
  ];
  const tab = allowed.includes(requested) ? requested : 'profile';
  const tabs = [
    { id: 'profile', name: '个人资料', icon: UserRound },
    { id: 'credentials', name: 'Git 凭据', icon: KeyRound },
    { id: 'security', name: '账号安全', icon: ShieldCheck },
    ...(me?.capabilities.can_admin
      ? [
          { id: 'identity', name: '账号与团队', icon: UsersRound },
          { id: 'roles', name: '角色与作用域', icon: ShieldCheck },
        ]
      : []),
    ...(me?.capabilities.can_audit
      ? [
          { id: 'audit', name: '审计', icon: ScrollText },
          { id: 'operations', name: '运行状态', icon: Activity },
        ]
      : []),
  ];
  return (
    <div className={accountPageStyles}>
      <PageHead
        eyebrow="YOUR ACCOUNT"
        title="个人中心"
        description="管理个人资料、仓库访问凭据与账号安全，随时了解你的协作动态。"
      />
      <PageTabs
        label="个人中心导航"
        value={tab}
        items={tabs.map((item) => ({
          id: item.id,
          label: (
            <>
              <item.icon size={16} />
              {item.name}
            </>
          ),
        }))}
        hrefFor={(value) => '/account' + (value === 'profile' ? '' : '?tab=' + value)}
      />
      <div className={pageContentStyles} key={tab}>
        {tab === 'profile' ? (
          <PersonalProfile />
        ) : tab === 'credentials' ? (
          <GitCredentialsPanel />
        ) : tab === 'security' ? (
          <PersonalSecurity />
        ) : tab === 'operations' ? (
          <OperationsPanel />
        ) : tab === 'audit' ? (
          <AuditPanel />
        ) : (
          <AdministrationPanel tab={tab} />
        )}
      </div>
    </div>
  );
}
