/**
 * 浏览器侧连接授权确认：读取 `/api/connections/authorize/:requestId`，用户裁决后
 * 提交 `{ allow, contribute }` 并跳转到服务端返回的 `redirect_uri`。
 */
import {
  btnStyles,
  panelStyles,
  formStackStyles,
  pageHeadTitleStyles,
} from '../../shared/styles/recipes.js';
import {
  connectionAuthorizationStyles,
  consentCardStyles,
  consentChoiceRowStyles,
  consentDetailsStyles,
  consentDetailToggleStyles,
  consentFooterStyles,
  consentIdentityStyles,
  consentPaneStyles,
  consentPermissionIconStyles,
  consentPermissionRowStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import type { ConnectionAuthorizationResponse } from '@capability-hub/contracts';
import { useEffect, useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { ApiError, mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useHub } from '../../shared/context/HubContext.js';
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Clock3,
  CornerUpLeft,
  Link,
  LockKeyhole,
  Share2,
} from '../../shared/icons/lucide.js';
import { ConnectionClientIcon } from '../../shared/icons/ConnectionClientIcon.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { UserAvatar } from '../../shared/components/UserAvatar.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { ListSkeleton } from '../../shared/components/Skeleton.js';

/**
 * 本地到期与服务端拒绝已消费的请求都结束本次授权。临时提交失败时保留用户的权限选择。
 */
export function ConnectionAuthorization({ requestId }: { requestId: string }) {
  const { me } = useHub();
  const [contribute, setContribute] = useState(false);
  const [pending, setPending] = useState<'allow' | 'cancel' | null>(null);
  const busy = pending !== null;
  const [failure, setFailure] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  const path = '/api/connections/authorize/' + encodeURIComponent(requestId);
  const { data, error, errorCode } = useQuery<ConnectionAuthorizationResponse>(path, attempt);
  const [now, setNow] = useState(Date.now);
  const expired = !!data && data.expires_at <= now;
  useEffect(() => {
    if (!data || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data, expired]);
  async function decide(allow: boolean) {
    if (busy || !data || data.expires_at <= Date.now()) {
      setNow(Date.now());
      return;
    }
    setPending(allow ? 'allow' : 'cancel');
    setFailure(undefined);
    try {
      const response = await mutate<{ redirect_uri: string }>(path, { allow, contribute });
      window.location.assign(response.redirect_uri);
    } catch (error) {
      setFailure(error instanceof Error ? error : new Error(errorMessage(error)));
      setPending(null);
    }
  }
  if (
    expired ||
    errorCode === 'INVALID_GRANT' ||
    (failure instanceof ApiError && failure.code === 'INVALID_GRANT')
  ) {
    return (
      <section
        aria-labelledby="inactive-authorization"
        className="mx-auto max-w-xl rounded-2xl border border-line bg-paper p-5 shadow-[var(--shadow)] sm:p-8"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <Clock3 size={24} />
          </span>
          <div>
            <h1 id="inactive-authorization" className={pageHeadTitleStyles}>
              授权链接已失效
            </h1>
            <p className="mt-1 text-label text-muted-ink">链接可能已过期或已使用。</p>
          </div>
        </div>
        <div className="mt-6 rounded-xl bg-page p-4">
          <h2 className="text-base font-semibold">如何重新连接</h2>
          <p className="mt-1 text-label leading-relaxed text-muted-ink">
            回到发起请求的 Agent 或终端，重新连接并打开新的授权链接。
          </p>
        </div>
        <a className={cn(btnStyles, 'mt-5')} href="/account?tab=security">
          查看已授权的 Agent <ArrowRight size={15} />
        </a>
      </section>
    );
  }
  if (error || !data) {
    return (
      <section className={cn(panelStyles, formStackStyles, connectionAuthorizationStyles)}>
        <h1 className={pageHeadTitleStyles}>确认连接权限</h1>
        {error ? (
          <ErrorState message={error} retry={() => setAttempt((value) => value + 1)} />
        ) : (
          <ListSkeleton rows={3} label="正在读取连接请求…" />
        )}
      </section>
    );
  }
  return (
    <section className={consentCardStyles} aria-label="连接授权">
      <div className={consentIdentityStyles}>
        <div className="grid min-w-0 gap-4 md:grid-rows-[auto_1fr] md:gap-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-muted-ink">
            <span aria-hidden="true" className="font-mono font-medium tracking-widest">
              CONNECTION REQUEST
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-2 py-0.5">
              <span className="size-1.5 rounded-full bg-brand/65" />
              {busy ? '提交中' : '待确认'}
            </span>
          </div>
          <div
            className={cn(
              'grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-4',
              'md:grid-cols-1 md:content-center md:justify-items-center md:text-center',
            )}
          >
            <div
              aria-hidden="true"
              className="flex w-full max-w-56 items-start text-caption text-muted-ink md:px-2"
            >
              <span className="flex shrink-0 flex-col items-center gap-1.5 md:w-15">
                <ConnectionClientIcon name={data.client_name} large />
                <span className="hidden whitespace-nowrap md:block">Agent 客户端</span>
              </span>
              <span className="hidden h-15 flex-1 items-center md:flex">
                <span className="flex-1 border-t border-dashed border-brand/35" />
                <Link
                  size={18}
                  className="box-content rounded-full border border-line bg-paper p-1.5 text-brand"
                />
                <span className="flex-1 border-t border-dashed border-brand/35" />
              </span>
              <span className="hidden w-15 shrink-0 flex-col items-center gap-1.5 md:flex">
                <span className="grid size-15 place-items-center rounded-2xl border border-line bg-paper">
                  <Glyph
                    seed="capability-hub"
                    kind="skill"
                    size={36}
                    pixelRevealClassName="origin-center [transform-box:fill-box] motion-safe:animate-[agent-dot-in_220ms_ease-out_backwards]"
                  />
                </span>
                <span className="whitespace-nowrap">Capability Hub</span>
              </span>
            </div>
            <div className="min-w-0 w-full">
              <p className="text-xl leading-tight font-semibold md:text-2xl md:text-balance">
                <bdi>{data.client_name}</bdi>
              </p>
              <p className="mt-2 text-label leading-relaxed text-balance text-muted-ink">
                授权后，应用将以你的身份访问{' '}
                <span className="whitespace-nowrap">Skill 和 MCP。</span>
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
      <div className={consentPaneStyles}>
        <div className="grid min-w-0 content-start gap-5">
          <header>
            <h1 className={pageHeadTitleStyles}>确认连接权限</h1>
            <p className="mt-1.5 text-label text-muted-ink">
              请核对权限。如果你没有发起这次连接，请取消。
            </p>
          </header>
          <div className="overflow-hidden rounded-xl border border-line">
            <div className={cn(consentPermissionRowStyles, 'bg-brand-soft/35')}>
              <span className={cn(consentPermissionIconStyles, 'bg-brand-soft text-brand')}>
                <BookOpen size={18} />
              </span>
              <strong className="col-start-2 row-start-1 text-base leading-snug">搜索和使用</strong>
              <span className="col-span-2 col-start-3 row-start-1 justify-self-end rounded-full bg-brand-soft px-2 py-0.5 text-caption font-medium text-brand">
                基础权限
              </span>
              <span className="col-span-3 col-start-2 row-start-2 text-label text-muted-ink">
                查找、读取和安装你有权访问的 Skill 与 MCP。
              </span>
            </div>
            {data.scope === 'hub:contribute' && (
              <label className={consentChoiceRowStyles}>
                <span className={cn(consentPermissionIconStyles, 'bg-page text-muted-ink')}>
                  <Share2 size={18} />
                </span>
                <strong className="col-start-2 row-start-1 text-base leading-snug">
                  分享、推荐与反馈
                </strong>
                <span className="col-start-3 row-start-1 justify-self-end text-caption text-muted-ink">
                  可选
                </span>
                <input
                  className="col-start-4 row-start-1 justify-self-end"
                  type="checkbox"
                  checked={contribute}
                  disabled={busy}
                  onChange={(e) => setContribute(e.target.checked)}
                />
                <small className="col-span-3 col-start-2 row-start-2 text-label text-muted-ink">
                  允许 Agent 分享 Skill、推荐资源或提交反馈。
                </small>
              </label>
            )}
          </div>
          <details className={consentDetailsStyles}>
            <summary className={consentDetailToggleStyles}>
              <CornerUpLeft size={16} className="text-muted-ink" />
              <span className="min-w-0">
                <span className="block text-caption text-muted-ink">授权后返回</span>
                <code dir="ltr" className="block text-label">
                  {data.redirect_origin}
                </code>
              </span>
              <span className="inline-flex items-center justify-self-end gap-1 text-label font-medium text-brand">
                连接详情
                <ChevronDown
                  size={14}
                  className="group-open/details:rotate-180 motion-safe:transition-transform"
                />
              </span>
            </summary>
            <div className="min-h-0 overflow-hidden">
              <dl className="mx-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-line py-3 text-label sm:mx-4">
                <dt className="text-muted-ink">名称来源</dt>
                <dd>客户端在注册时提供</dd>
                <dt className="text-muted-ink">服务地址</dt>
                <dd>
                  <code dir="ltr">{data.resource}</code>
                </dd>
                <dt className="text-muted-ink">返回地址</dt>
                <dd>
                  <code dir="ltr">{data.redirect_origin}</code>
                </dd>
              </dl>
            </div>
          </details>
          <p className="flex items-start gap-2 text-label text-muted-ink">
            <LockKeyhole size={15} className="mt-0.5 shrink-0" />
            权限受当前账号限制，可随时在账号安全中断开连接。
          </p>
          {failure && <Message error>{failure.message}</Message>}
        </div>
        <div className={cn(consentFooterStyles, 'flex-wrap justify-end')}>
          <button
            type="button"
            className={btnStyles}
            disabled={busy}
            aria-busy={pending === 'cancel' || undefined}
            onClick={() => void decide(false)}
          >
            {pending === 'cancel' ? '正在取消…' : '取消'}
          </button>
          <Submit busy={pending === 'allow'} disabled={busy} onClick={() => void decide(true)}>
            允许连接{!busy && <ArrowRight size={15} />}
          </Submit>
        </div>
      </div>
    </section>
  );
}
