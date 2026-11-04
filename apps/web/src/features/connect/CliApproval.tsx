import { useState } from 'react';
import { approveCliLoginRequestSchema } from '@capability-hub/contracts';
import { ApiError, mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { InputField } from '../../shared/components/InputField.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { UserAvatar } from '../../shared/components/UserAvatar.js';
import { useHub } from '../../shared/context/HubContext.js';
import {
  ArrowRight,
  BookOpen,
  CircleCheck,
  Clock3,
  Link,
  LockKeyhole,
  SquareTerminal,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, pageHeadTitleStyles } from '../../shared/styles/recipes.js';
import {
  consentCardStyles,
  consentFooterStyles,
  consentIdentityStyles,
  consentPaneStyles,
  consentPermissionIconStyles,
  consentPermissionRowStyles,
} from './styles.js';

/** 网页批准只绑定账号，登录结果由原 CLI 轮询获取；终态不再提供重复批准入口。 */
export function CliApproval({ initialCode }: { initialCode: string }) {
  const { me } = useHub();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Error>();
  const expired = failure instanceof ApiError && failure.code === 'CLI_LOGIN_EXPIRED';
  const valid = approveCliLoginRequestSchema.safeParse({ code }).success;
  async function approve() {
    if (busy || approved || expired || !valid) return;
    setBusy(true);
    setFailure(undefined);
    try {
      await mutate('/api/cli/approve', { code });
      setApproved(true);
    } catch (error) {
      setFailure(error instanceof Error ? error : new Error(errorMessage(error)));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={consentCardStyles} aria-label="CLI 登录授权">
      <div className={consentIdentityStyles}>
        <div className="grid min-w-0 gap-4 md:grid-rows-[auto_1fr] md:gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted-ink">
            <span aria-hidden="true" className="font-mono font-medium tracking-widest">
              CLI SIGN IN
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-0.5">
              <span className="size-1.5 rounded-full bg-brand/65" />
              {approved ? '已批准' : expired ? '已失效' : busy ? '提交中' : '待确认'}
            </span>
          </div>
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-4 md:grid-cols-1 md:content-center md:justify-items-center md:text-center">
            <div aria-hidden="true" className="flex w-full max-w-56 items-center md:px-2">
              <span className="grid size-15 shrink-0 place-items-center rounded-2xl border border-line bg-paper text-brand">
                <SquareTerminal size={30} />
              </span>
              <span className="hidden flex-1 items-center md:flex">
                <span className="flex-1 border-t border-dashed border-brand/35" />
                <Link
                  size={18}
                  className="box-content rounded-full border border-line bg-paper p-1.5 text-brand"
                />
                <span className="flex-1 border-t border-dashed border-brand/35" />
              </span>
              <span className="hidden size-15 shrink-0 place-items-center rounded-2xl border border-line bg-paper md:grid">
                <Glyph
                  seed="capability-hub"
                  kind="skill"
                  size={36}
                  pixelRevealClassName="origin-center [transform-box:fill-box] motion-safe:animate-[agent-dot-in_220ms_ease-out_backwards]"
                />
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xl leading-tight font-semibold md:text-2xl md:text-balance">
                Capability Hub CLI
              </p>
              <p className="mt-2 text-label leading-relaxed text-balance text-muted-ink">
                在终端中访问团队的 Skill 和 MCP。
              </p>
            </div>
          </div>
        </div>
        {me && (
          <div className={consentFooterStyles}>
            <UserAvatar identity={me.id} color={me.avatar_color} size={34} />
            <div className="min-w-0">
              <p className="text-caption text-muted-ink">授权账号</p>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <strong className="text-base">
                  <bdi>{me.display_name}</bdi>
                </strong>
                <code className="text-label text-muted-ink">{me.username}</code>
              </div>
            </div>
          </div>
        )}
      </div>
      {approved || expired ? (
        <div className={consentPaneStyles}>
          <div role={expired ? 'alert' : 'status'} className="grid content-center gap-4 py-4">
            <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
              {approved ? <CircleCheck size={26} /> : <Clock3 size={26} />}
            </span>
            <h1 className={pageHeadTitleStyles}>
              {approved ? 'CLI 登录已批准' : '授权码无效或已过期'}
            </h1>
            <p className="text-label leading-relaxed text-muted-ink">
              {approved
                ? '请回到发起登录的终端，等待 CLI 完成登录。此页面可以关闭。'
                : '授权码可能已过期或已使用。请在终端重新发起 CLI 登录，并打开新的授权链接。'}
            </p>
          </div>
          <div className={cn(consentFooterStyles, 'justify-end')}>
            <a className={btnStyles} href={approved ? '/account?tab=security' : '/connect'}>
              {approved ? '前往账号安全' : '返回接入指引'} <ArrowRight size={15} />
            </a>
          </div>
        </div>
      ) : (
        <form
          className={consentPaneStyles}
          onSubmit={(event) => {
            event.preventDefault();
            void approve();
          }}
        >
          <div className="grid min-w-0 content-start gap-5">
            <header>
              <h1 className={pageHeadTitleStyles}>确认 CLI 登录</h1>
              <p className="mt-1.5 text-label text-muted-ink">
                核对终端中的授权码，一致后允许登录。
              </p>
            </header>
            <div className="grid w-full max-w-80 gap-2 text-label font-medium">
              <label htmlFor="cli-approval-code">授权码</label>
              <InputField
                id="cli-approval-code"
                icon="key"
                value={code}
                disabled={busy}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setFailure(undefined);
                }}
                className="font-mono text-2xl tracking-widest"
                autoComplete="off"
                spellCheck={false}
                required
                pattern="[A-Fa-f0-9]{8}"
                maxLength={8}
                aria-describedby="cli-code-help"
              />
              <span id="cli-code-help" className="text-caption font-normal text-muted-ink">
                仅批准你本人刚刚发起的登录请求。
              </span>
            </div>
            <div
              className={cn(
                consentPermissionRowStyles,
                'rounded-xl border border-line bg-brand-soft/35',
              )}
            >
              <span className={cn(consentPermissionIconStyles, 'bg-brand-soft text-brand')}>
                <BookOpen size={18} />
              </span>
              <strong className="col-start-2 row-start-1 text-base leading-snug">搜索和使用</strong>
              <span className="col-span-2 col-start-3 row-start-1 justify-self-end rounded-full bg-brand-soft px-2 py-0.5 text-caption font-medium text-brand">
                只读权限
              </span>
              <span className="col-span-3 col-start-2 row-start-2 text-label text-muted-ink">
                查找、读取和安装你有权访问的 Skill，获取 MCP 配置。
              </span>
            </div>
            <p className="flex items-start gap-2 text-label text-muted-ink">
              <LockKeyhole size={15} className="mt-0.5 shrink-0" />
              登录凭据由 CLI 保存在本机，可在账号安全中撤销。
            </p>
            {failure && <Message error>{failure.message}</Message>}
          </div>
          <div className={cn(consentFooterStyles, 'flex-wrap justify-end')}>
            <button
              type="button"
              className={btnStyles}
              disabled={busy}
              onClick={() => window.location.assign('/connect')}
            >
              暂不登录
            </button>
            <Submit type="submit" busy={busy} disabled={!valid}>
              {busy ? '正在批准…' : '允许 CLI 登录'} {!busy && <ArrowRight size={15} />}
            </Submit>
          </div>
        </form>
      )}
    </section>
  );
}
