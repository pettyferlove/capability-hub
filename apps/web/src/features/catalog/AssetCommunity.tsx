import {
  assetCommunityStyles,
  communityActionsStyles,
  communitySelectedStyles,
  communityCountStyles,
  communityStateStyles,
  nominationFormStyles,
} from './styles.js';
import {
  btnStyles,
  textBtnStyles,
  formStackStyles,
  subtleStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { nominationReasonLength } from '@capability-hub/contracts';
import type { AssetResponse } from '@capability-hub/contracts/http';
import { ArrowUpRight, Award, Check, ThumbsUp } from '../../shared/icons/lucide.js';
import { useEffect, useId, useState } from 'react';
import { mutate } from '../../shared/api/client.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { useHub } from '../../shared/context/HubContext.js';
import { assetHref, loginHref, pageHref } from '../../shared/navigation/history-route.js';

/**
 * 详情里的社区区：推荐（`POST /api/ratings`），以及分类为 general 时的精选提名
 * （`POST /api/nominations`）。两个动作都要登录，成功后用接口返回的社区对象覆盖本地状态
 * 并触发全局 reload。
 */
export function AssetCommunity({ asset }: { asset: AssetResponse }) {
  const { me, reload } = useHub();
  const [community, setCommunity] = useState(asset.community);
  const [nominating, setNominating] = useState(false);
  const [reason, setReason] = useState('');
  const reasonHintId = useId();
  const reasonLength = reason.trim().length;
  const missingCharacters = Math.max(0, nominationReasonLength.min - reasonLength);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => setCommunity(asset.community), [asset.community]);
  const general = asset.current_release.category === 'general';
  async function recommend() {
    setBusy('recommend');
    setError('');
    try {
      const result = await mutate<AssetResponse['community']>('/api/ratings', {
        version_id: asset.current_release.version_id,
        recommended: !community.recommended,
      });
      setCommunity(result);
      reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : '推荐失败，请重试');
    } finally {
      setBusy('');
    }
  }
  async function nominate() {
    setBusy('nominate');
    setError('');
    try {
      const result = await mutate<{ id: string }>('/api/nominations', {
        release_id: asset.current_release.release_id,
        reason,
      });
      setCommunity((value) => ({ ...value, nomination: { request_id: result.id, mine: true } }));
      setNominating(false);
      setReason('');
      reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : '提名失败，请重试');
    } finally {
      setBusy('');
    }
  }
  return (
    <section className={assetCommunityStyles} aria-label="资源推荐与通用提名">
      <div className={communityActionsStyles}>
        {me ? (
          <button
            type="button"
            className={cn(btnStyles, community.recommended ? communitySelectedStyles : '')}
            aria-pressed={community.recommended}
            disabled={!!busy}
            onClick={recommend}
          >
            <ThumbsUp size={16} />
            {community.recommended ? '已推荐' : '推荐这个资源'}
            <span className={communityCountStyles}>{community.recommendation_count}</span>
          </button>
        ) : (
          <a className={btnStyles} href={loginHref(assetHref(asset.slug))}>
            <ThumbsUp size={16} />
            登录后推荐<span className={communityCountStyles}>{community.recommendation_count}</span>
          </a>
        )}
        {general ? (
          <span className={communityStateStyles}>
            <Award size={16} />
            已通过通用审核
          </span>
        ) : community.nomination ? (
          <span className={communityStateStyles}>
            <Check size={16} />
            通用提名审核中
          </span>
        ) : me ? (
          <button
            type="button"
            className={btnStyles}
            disabled={!!busy || asset.lifecycle !== 'active'}
            aria-expanded={nominating}
            onClick={() => {
              setNominating((value) => !value);
              setError('');
            }}
          >
            <Award size={16} />
            提名为通用
          </button>
        ) : (
          <a className={btnStyles} href={loginHref(assetHref(asset.slug))}>
            <Award size={16} />
            登录后提名
          </a>
        )}
      </div>
      {community.nomination?.mine && (
        <a
          className={textBtnStyles}
          href={pageHref('review', { request: community.nomination.request_id })}
        >
          查看我的提名
          <ArrowUpRight size={14} />
        </a>
      )}
      {nominating && !community.nomination && (
        <form
          className={cn(formStackStyles, nominationFormStyles)}
          onSubmit={(event) => {
            event.preventDefault();
            void nominate();
          }}
        >
          <div className="grid gap-2">
            <label>
              为什么值得成为通用能力？
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                minLength={nominationReasonLength.min}
                maxLength={nominationReasonLength.max}
                aria-describedby={reasonHintId}
                placeholder="哪些团队能复用它？它能帮他们解决什么问题？"
              />
            </label>
            <p id={reasonHintId} className={subtleStyles} role="status">
              {reasonLength === 0
                ? `请填写 ${nominationReasonLength.min}～${nominationReasonLength.max} 字的提名理由。`
                : missingCharacters > 0
                  ? `再写 ${missingCharacters} 个字就能提交。`
                  : '提名理由已填好。'}
            </p>
          </div>
          <p className={subtleStyles}>
            审核通过后归入「通用」，当前可见范围仍为「{asset.current_release.visibility_label}」。
          </p>
          <div className={communityActionsStyles}>
            <Submit
              type="submit"
              busy={busy === 'nominate'}
              disabled={!!busy || missingCharacters > 0}
            >
              提交通用提名
            </Submit>
            <button
              type="button"
              className={btnStyles}
              disabled={!!busy}
              onClick={() => setNominating(false)}
            >
              取消
            </button>
          </div>
        </form>
      )}
      {error && <Message error>{error}</Message>}
    </section>
  );
}
