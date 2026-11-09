/**
 * 身份入口：登录页与首次初始化面板共用一套表单。数据来自 `/auth/login` / `/auth/setup`，
 * 提交成功后不自行跳转，由 `onLogin` 交由外层刷新会话并决定去往何处。
 */
import { InputField } from '../../shared/components/InputField.js';
import type { LoginProvider } from '@capability-hub/contracts';
import { Segmented } from '../../shared/components/Segmented.js';
import {
  authLayoutStyles,
  authStoryStyles,
  authPitchStyles,
  authLinksStyles,
  authFormStyles,
  authCardStyles,
  authFootStyles,
  authEyebrowStyles,
  authResourcesStyles,
  authResourceStyles,
  authResourceIconStyles,
  authWelcomeStyles,
  authSubmitStyles,
  authAnimationStyles,
} from './styles.js';
import {
  brandStyles,
  desktopOnlyStyles,
  subtleStyles,
  formStackStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import {
  ArrowRight,
  ArrowUpRight,
  Pause,
  Play,
  Plug,
  Sparkles,
} from '../../shared/icons/lucide.js';
import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { Message } from '../../shared/components/Message.js';
import { PasswordField } from '../../shared/components/PasswordField.js';
import { Submit } from '../../shared/components/Submit.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { GradientText } from '../../shared/components/react-bits/GradientText.js';
import { SpotlightCard } from '../../shared/components/react-bits/SpotlightCard.js';
import { GradientAscii } from '../../shared/components/react-bits/GradientAscii.js';

const loginMethods: { id: LoginProvider; label: string }[] = [
  { id: 'local', label: '本地账号' },
  { id: 'ldap', label: 'LDAP 账号' },
];

/**
 * `initialized` 为假时同一表单走 `/auth/setup`：需二次确认密码，且 `confirm_password`
 * 在提交前被移除、不会发往服务端。失败只渲染服务端错误文案，输入不做清空以便重试。
 */
export default function LoginPage({
  initialized,
  setupRequired = false,
  ldapEnabled = false,
  onLogin,
}: {
  initialized: boolean;
  setupRequired?: boolean;
  ldapEnabled?: boolean;
  onLogin: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<LoginProvider>('local');
  const [backgroundPaused, setBackgroundPaused] = useState(false);
  const provider = initialized && ldapEnabled ? method : 'local';
  const directoryLogin = provider === 'ldap';
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (!initialized && data.password !== data.confirm_password) {
      setError('两次输入的密码不一致');
      setBusy(false);
      return;
    }
    delete data.confirm_password;
    try {
      if (initialized) await mutate('/auth/login', { ...data, provider });
      else await mutate('/auth/setup', data);
      await onLogin();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={authLayoutStyles}>
      <section className={authStoryStyles} aria-labelledby="auth-story-title">
        <GradientAscii paused={backgroundPaused} />
        <a href="/discover" className={cn(brandStyles, 'relative w-fit')}>
          <Glyph seed="capability-hub" kind="skill" size={34} />
          <span>
            Capability Hub<small>能力共享中心</small>
          </span>
        </a>
        <div className={authPitchStyles}>
          <p className={authEyebrowStyles}>AGENT SKILLS & MCP</p>
          <h1 id="auth-story-title">
            发现好工具，
            <br />
            <GradientText>共享好能力。</GradientText>
          </h1>
          <p className="max-w-96 text-base leading-7 text-muted-ink max-[760px]:text-sm max-[760px]:leading-6">
            让 Skills 和 MCP 服务成为团队的共同积累。
            <br className={desktopOnlyStyles} />
            从发现、接入到分享，在这里连接你的工作流。
          </p>
          <div className={authResourcesStyles}>
            <SpotlightCard className={authResourceStyles}>
              <span className={authResourceIconStyles} aria-hidden="true">
                <Sparkles size={21} />
              </span>
              <h2>Agent Skills</h2>
              <p>沉淀经验，复用每一次好实践。</p>
            </SpotlightCard>
            <SpotlightCard className={authResourceStyles}>
              <span className={authResourceIconStyles} aria-hidden="true">
                <Plug size={21} />
              </span>
              <h2>MCP 服务</h2>
              <p>连接工具，扩展 Agent 的能力。</p>
            </SpotlightCard>
          </div>
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-x-5 gap-y-2 max-[760px]:mt-4">
          <nav className={authLinksStyles} aria-label="资源导航">
            <a href="/discover">
              资源目录
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
            <a href="/connect">
              安装与接入
              <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </nav>
          <button
            type="button"
            className={authAnimationStyles}
            onClick={() => setBackgroundPaused((value) => !value)}
          >
            {backgroundPaused ? (
              <Play size={13} aria-hidden="true" />
            ) : (
              <Pause size={13} aria-hidden="true" />
            )}
            {backgroundPaused ? '播放背景动效' : '暂停背景动效'}
          </button>
        </div>
      </section>
      <section className={authFormStyles} aria-labelledby="auth-form-title">
        <div className={authCardStyles}>
          <p className={authWelcomeStyles}>{initialized ? '欢迎回来' : '开始使用'}</p>
          <h2 id="auth-form-title">{initialized ? '登录 Capability Hub' : '初始化平台'}</h2>
          <p className={subtleStyles}>
            {initialized
              ? directoryLogin
                ? '输入组织目录中的用户名和密码。'
                : '输入你的 Hub 本地账号和密码。'
              : '创建平台管理员账号和首个维护团队。'}
          </p>
          {initialized && ldapEnabled && (
            <fieldset disabled={busy} className="mb-5 min-w-0 border-0 p-0">
              <Segmented
                id="login-provider"
                label="登录方式"
                options={loginMethods}
                value={provider}
                onChange={(next) => {
                  if (next !== provider) {
                    setMethod(next);
                    setError('');
                  }
                }}
              />
            </fieldset>
          )}
          <form
            key={provider}
            onSubmit={submit}
            className={formStackStyles}
            aria-label={initialized ? (directoryLogin ? 'LDAP 登录' : '本地登录') : '初始化'}
          >
            {!initialized && setupRequired && (
              <PasswordField
                name="setup_token"
                label="部署初始化密钥"
                minimum={1}
                placeholder="部署时设置的一次性密钥"
              />
            )}
            {!initialized && (
              <label>
                显示名称
                <InputField
                  icon="user"
                  name="display_name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="你的姓名"
                />
              </label>
            )}
            <label>
              账号
              <InputField
                icon="user"
                name="username"
                required
                minLength={initialized ? 1 : 3}
                maxLength={64}
                autoComplete={initialized ? `section-${provider} username` : 'username'}
                placeholder={directoryLogin ? '请输入目录用户名' : '请输入账号'}
              />
            </label>
            <PasswordField
              label="密码"
              name="password"
              minimum={initialized ? 1 : 12}
              autoComplete={initialized ? `section-${provider} current-password` : 'new-password'}
              placeholder={initialized ? '请输入密码' : '至少 12 位'}
            />
            {!initialized && (
              <PasswordField label="确认密码" name="confirm_password" placeholder="再次输入密码" />
            )}
            {!initialized && (
              <label>
                维护团队
                <InputField
                  icon="users"
                  name="team_name"
                  required
                  maxLength={80}
                  placeholder="例如：平台工程组"
                />
              </label>
            )}
            {error && <Message error>{error}</Message>}
            <Submit busy={busy} className={authSubmitStyles}>
              {initialized ? (directoryLogin ? '登录 LDAP 账号' : '登录本地账号') : '创建并进入'}
              <ArrowRight size={17} />
            </Submit>
          </form>
          <p className={authFootStyles}>
            {initialized
              ? directoryLogin
                ? '目录账号首次登录后自动开通，密码由 LDAP 目录管理。'
                : '如需开通账号或重置密码，请联系平台管理员。'
              : '初始化完成后，请添加其他审核人员；发布者不能审核自己的提交。'}
          </p>
          <a className={textBtnStyles} href="/discover">
            浏览公开资源
            <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
