/**
 * 个人资料、Git 凭据和账号安全面向登录用户；管理账号、团队与授权还需要身份管理权限。
 */
import { accountPageTabs } from '@capability-hub/contracts/web-pages';
import { accountPageStyles } from './styles.js';
import { pageContentStyles } from '../../shared/styles/recipes.js';
import { KeyRound, ShieldCheck, UserRound, UsersRound } from '../../shared/icons/lucide.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { useHub } from '../../shared/context/HubContext.js';
import { GitCredentialsPanel } from '../profile/GitCredentialsPanel.js';
import { PersonalProfile } from '../profile/PersonalProfile.js';
import { PersonalSecurity } from '../profile/SecurityPanel.js';
import { AdministrationPanel } from './AdministrationPanel.js';

const sections = {
  profile: { name: '个人资料', icon: UserRound },
  credentials: { name: 'Git 凭据', icon: KeyRound },
  security: { name: '账号安全', icon: ShieldCheck },
  identity: { name: '账号与团队', icon: UsersRound },
  roles: { name: '角色与作用域', icon: ShieldCheck },
};

/** 身份管理页签仅向有权管理账号的用户开放。 */
export default function AccountPage({ query = location.search }: { query?: string }) {
  const { me } = useHub();
  const requested = new URLSearchParams(query).get('tab') ?? 'profile';
  const tabs = accountPageTabs
    .filter((id) => (id !== 'identity' && id !== 'roles') || me?.capabilities.can_admin)
    .map((id) => ({ id, ...sections[id] }));
  const tab = tabs.find(({ id }) => id === requested)?.id ?? 'profile';
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
        ) : (
          <AdministrationPanel tab={tab} />
        )}
      </div>
    </div>
  );
}
