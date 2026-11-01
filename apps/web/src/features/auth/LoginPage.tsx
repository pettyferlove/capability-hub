/**
 * 身份入口：登录页与首次初始化面板共用一套表单。数据来自 `/auth/login` / `/auth/setup`，
 * 提交成功后不自行跳转，由 `onLogin` 交由外层刷新会话并决定去往何处。
 */
import { InputField } from '../../shared/components/InputField.js';
import {
  authLayoutStyles,
  authStoryStyles,
  authPitchStyles,
  authLinksStyles,
  authFormStyles,
  authCardStyles,
  authFootStyles,
} from './styles.js';
import {
  dotgridStyles,
  brandStyles,
  desktopOnlyStyles,
  subtleStyles,
  formStackStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { ArrowRight } from '../../shared/icons/lucide.js';
import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { Message } from '../../shared/components/Message.js';
import { PasswordField } from '../../shared/components/PasswordField.js';
import { Submit } from '../../shared/components/Submit.js';
import { Glyph } from '../../shared/components/Glyph.js';

/**
 * `initialized` 为假时同一表单走 `/auth/setup`：需二次确认密码，且 `confirm_password`
 * 在提交前被移除、不会发往服务端。失败只渲染服务端错误文案，输入不做清空以便重试。
 */
export default function LoginPage({
  initialized,
  setupRequired = false,
  onLogin,
}: {
  initialized: boolean;
  setupRequired?: boolean;
  onLogin: () => Promise<void>;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
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
      await mutate(initialized ? '/auth/login' : '/auth/setup', data);
      await onLogin();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={authLayoutStyles}>
      <section className={cn(authStoryStyles, dotgridStyles)}>
        <a href="/discover" className={brandStyles}>
          <Glyph seed="capability-hub" kind="skill" size={34} />
          <span>
            Capability Hub<small>能力共享中心</small>
          </span>
        </a>
        <div className={authPitchStyles}>
          <h1>
            发现与共享
            <br />
            <span>Skills 和 MCP 服务</span>
          </h1>
          <p>
            查找并安装 Skill，配置 MCP 服务接入。
            <br className={desktopOnlyStyles} />
            发布和管理资源，与团队共享。
          </p>
        </div>
        <nav className={authLinksStyles} aria-label="资源导航">
          <a href="/discover">资源目录</a>
          <a href="/connect">安装与接入</a>
        </nav>
      </section>
      <section className={authFormStyles}>
        <div className={authCardStyles}>
          <h2>{initialized ? '登录' : '初始化平台'}</h2>
          <p className={subtleStyles}>
            {initialized
              ? '使用平台账号登录，访问已授权的资源。'
              : '创建平台管理员账号和首个维护团队。'}
          </p>
          <form
            onSubmit={submit}
            className={formStackStyles}
            aria-label={initialized ? '登录' : '初始化'}
          >
            {!initialized && setupRequired && (
              <PasswordField name="setup_token" label="部署初始化密钥" minimum={1} />
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
                autoComplete="username"
                placeholder="请输入账号"
              />
            </label>
            <PasswordField
              label="密码"
              name="password"
              minimum={initialized ? 1 : 12}
              autoComplete={initialized ? 'current-password' : 'new-password'}
              placeholder={initialized ? '请输入密码' : '至少 12 位'}
            />
            {!initialized && <PasswordField label="确认密码" name="confirm_password" />}
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
            <Submit busy={busy}>
              {initialized ? '登录' : '创建并进入'}
              <ArrowRight size={17} />
            </Submit>
          </form>
          <p className={authFootStyles}>
            {initialized
              ? '如需开通账号或重置密码，请联系平台管理员。'
              : '初始化完成后，请添加其他审核人员；发布者不能审核自己的提交。'}
          </p>
          <a className={textBtnStyles} href="/discover">
            浏览公开资源
          </a>
        </div>
      </section>
    </div>
  );
}
