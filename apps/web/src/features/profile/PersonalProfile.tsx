import { InputField } from '../../shared/components/InputField.js';
import {
  profileBannerStyles,
  profileStatsStyles,
  profileGridStyles,
  profileSideStyles,
  profileTeamsStyles,
  teamMonogramStyles,
  profileRoleChipsStyles,
  profileActivityStyles,
  activityDotStyles,
} from './styles.js';
import {
  panelStyles,
  eyebrowStyles,
  subtleStyles,
  sectionHeadingStyles,
  formStackStyles,
  formRowStyles,
  formActionsStyles,
  tagStyles,
  tagTealStyles,
  chipsStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { ActivityResponse, ProfileResponse } from '@capability-hub/contracts/http';
import { History, Save, UserRound, UsersRound } from '../../shared/icons/lucide.js';
import { useState, type FormEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { formFields } from '../../shared/api/form-fields.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { ListSkeleton, ProfileSkeleton } from '../../shared/components/Skeleton.js';
import { UserAvatar } from '../../shared/components/UserAvatar.js';
import type { AvatarColor } from '../../shared/components/user-avatar.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { AvatarPalettePicker } from './AvatarPalettePicker.js';
export function PersonalProfile() {
  const { me, refresh, reload } = useHub(),
    { data, error, loading } = useQuery<ProfileResponse>('/api/me/profile', refresh),
    { data: activity, error: activityError } = useQuery<ActivityResponse[]>(
      '/api/me/activity',
      refresh,
    );
  const [avatarDraft, setAvatarDraft] = useState<{ revision: number; color: AvatarColor }>();
  const [feedback, setFeedback] = useState(''),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  if (error) return <ErrorState message={error} retry={reload} />;
  if (!data) return <ProfileSkeleton />;
  const avatarColor =
    avatarDraft?.revision === data.revision ? avatarDraft.color : data.avatar_color;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFeedback('');
    try {
      await mutate('/api/me/profile', formFields(e.currentTarget), 'PATCH', data!.revision);
      setFailed(false);
      setFeedback('个人资料已更新');
      reload();
    } catch (e) {
      setFailed(true);
      setFeedback(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <section className={cn(profileBannerStyles, panelStyles)}>
        <UserAvatar identity={data.id} color={avatarColor} size={72} />
        <div>
          <p className={eyebrowStyles}>MY WORKSPACE</p>
          <h2>{data.display_name}</h2>
          <p className={subtleStyles}>
            @{data.username}
            {data.title && ' · ' + data.title}
          </p>
        </div>
        <div className={profileStatsStyles}>
          <span>
            <strong>{data.stats.submissions}</strong>发布申请
          </span>
          <span>
            <strong>{data.stats.decisions}</strong>审核决定
          </span>
          <span>
            <strong>{data.stats.credentials}</strong>Git 凭据
          </span>
        </div>
      </section>
      <div className={profileGridStyles}>
        <section className={panelStyles}>
          <div className={sectionHeadingStyles}>
            <div>
              <h2>基本资料</h2>
              <p className={subtleStyles}>让协作伙伴更容易认识你。</p>
            </div>
            <UserRound size={20} />
          </div>
          <form className={formStackStyles} onSubmit={save} key={data.revision}>
            <div className={formRowStyles}>
              <label>
                显示名称
                <InputField
                  icon="user"
                  name="display_name"
                  defaultValue={data.display_name}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                职位 / 职责
                <InputField
                  icon="briefcase"
                  name="title"
                  defaultValue={data.title}
                  maxLength={80}
                  placeholder="例如 平台工程师"
                />
              </label>
            </div>
            <label>
              联系邮箱 <small>选填，仅在个人资料中保存</small>
              <InputField
                icon="mail"
                name="email"
                type="email"
                defaultValue={data.email}
                maxLength={254}
                placeholder="name@company.com"
              />
            </label>
            <label>
              个人简介
              <textarea
                name="bio"
                defaultValue={data.bio}
                maxLength={500}
                placeholder="介绍你的工作方向与擅长领域…"
              />
            </label>
            <AvatarPalettePicker
              identity={data.id}
              color={avatarColor}
              onChange={(color) => setAvatarDraft({ revision: data.revision, color })}
            />
            {feedback && <Message error={failed}>{feedback}</Message>}
            <div className={formActionsStyles}>
              <span className={subtleStyles}>加入于 {dateLabel(data.created_at)}</span>
              <Submit busy={busy || loading}>
                <Save size={16} />
                保存资料
              </Submit>
            </div>
          </form>
        </section>
        <div className={profileSideStyles}>
          <section className={panelStyles}>
            <div className={sectionHeadingStyles}>
              <h2>我的团队与角色</h2>
              <UsersRound size={20} />
            </div>
            <div className={profileTeamsStyles}>
              {me?.groups.length ? (
                me.groups.map((g) => (
                  <div key={g.id}>
                    <span className={teamMonogramStyles}>{g.name.slice(0, 1)}</span>
                    <strong>{g.name}</strong>
                    <span className={cn(tagStyles, tagTealStyles)}>成员</span>
                  </div>
                ))
              ) : (
                <p className={subtleStyles}>尚未加入维护团队，请联系管理员。</p>
              )}
            </div>
            <div className={cn(chipsStyles, profileRoleChipsStyles)}>
              {data.roles.map((r, i: number) => (
                <span className={tagStyles} key={i}>
                  {r.name} ·{' '}
                  {
                    (
                      {
                        platform: '平台',
                        team: '团队',
                        source: '来源',
                        asset: '资产',
                        scenario: '场景',
                      } as Record<string, string>
                    )[r.scope_type]
                  }
                </span>
              ))}
            </div>
            <p className={subtleStyles}>团队成员关系和角色由管理员维护。</p>
          </section>
          <section className={cn(panelStyles, profileActivityStyles)}>
            <div className={sectionHeadingStyles}>
              <div>
                <h2>最近动态</h2>
                <p className={subtleStyles}>最近 5 条个人操作</p>
              </div>
              <History size={20} />
            </div>
            {activityError ? (
              <ErrorState message={activityError} retry={reload} />
            ) : !activity ? (
              <ListSkeleton label="正在加载最近动态…" rows={3} />
            ) : activity.length ? (
              <ol>
                {activity.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    <span className={activityDotStyles} />
                    <div>
                      <strong>{a.action_label}</strong>
                      <small>{dateLabel(a.occurred_at)}</small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={subtleStyles}>暂无操作记录。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
