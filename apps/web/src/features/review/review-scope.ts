import type { PublicationDraftPolicy } from '@capability-hub/contracts';

/** 需要平台审核的原因，按提示优先级排列：受众原因在前，分类原因在后。 */
export type PlatformReviewReason = 'public' | 'organization' | 'outside' | 'general' | 'proposed';

/**
 * 申请可由哪一级审核者决定。规则须与服务端 `AssetAccessService.canReview` 一致，只用于提示，
 * 授权以服务端为准：`platform` 仅限平台审核者；`scenario` 还接受覆盖全部所选场景的审核者；
 * `team` 还接受资产所属团队、来源或资产范围的审核者。
 */
export type ReviewScope =
  { kind: 'platform'; reasons: PlatformReviewReason[] } | { kind: 'scenario' | 'team' };

/** `outside` 指受众包含资产所属团队以外的团队或成员，公开与所有登录用户单独计入。 */
export function reviewScope(
  policy: Pick<PublicationDraftPolicy, 'category' | 'proposed_scenarios' | 'distribution'>,
  ownerGroupId: string,
): ReviewScope {
  const audience = policy.distribution.audience;
  const reasons: PlatformReviewReason[] = [];
  if (audience.includes('public')) reasons.push('public');
  if (audience.includes('organization')) reasons.push('organization');
  if (audience.some((id) => !['public', 'organization', `group:${ownerGroupId}`].includes(id)))
    reasons.push('outside');
  if (policy.category === 'general') reasons.push('general');
  if (policy.proposed_scenarios?.length) reasons.push('proposed');
  if (reasons.length) return { kind: 'platform', reasons };
  return { kind: policy.category === 'scenario' ? 'scenario' : 'team' };
}
