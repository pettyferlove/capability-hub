import type { ReactNode } from 'react';
import { audienceIcons, classificationIcons } from '../../shared/components/select-icons.js';
import { policyFieldsStyles } from './styles.js';
import { chipsStyles, checkLabelStyles } from '../../shared/styles/recipes.js';
import type { PublicationDraftPolicy } from '@capability-hub/contracts';
import { PublicationScenarioFields } from './PublicationScenarioFields.js';
import { useHub } from '../../shared/context/HubContext.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Message } from '../../shared/components/Message.js';

/**
 * 发布策略字段：受众是 `public`、`organization`、团队与成员 id 的混选，未知 id 用占位名保留展示而不是
 * 丢弃，避免静默改动既有配置；切换分类会清空已选场景。场景列表来自 `/api/scenarios`。
 */
export function PublicationPolicyFields({
  value,
  onChange,
  categoryHint,
}: {
  value: PublicationDraftPolicy;
  categoryHint?: ReactNode;
  onChange: (v: PublicationDraftPolicy) => void;
}) {
  const { me } = useHub();
  const update = (v: Partial<PublicationDraftPolicy>) => onChange({ ...value, ...v });
  const audience = value.distribution.audience;
  const audienceMode = audience.includes('public')
    ? 'public'
    : audience.includes('organization')
      ? 'organization'
      : 'restricted';
  const audienceOptions = new Map(
    me?.groups.map((group) => [`group:${group.id}`, group.name]) ?? [],
  );
  for (const id of audience)
    if (!['public', 'organization'].includes(id) && !audienceOptions.has(id))
      audienceOptions.set(id, `${id.startsWith('group:') ? '团队' : '成员'} ${id.split(':')[1]}`);
  return (
    <div className={policyFieldsStyles}>
      <div>
        <label data-draft-field="category">
          分类
          <SelectField
            optionIcons={classificationIcons}
            value={value.category}
            onValueChange={(nextValue) =>
              update({
                category: nextValue as PublicationDraftPolicy['category'],
                scenario_ids: [],
                proposed_scenarios: undefined,
              })
            }
          >
            <option value="uncategorized">未分类</option>
            <option value="scenario">场景</option>
            <option value="general">通用</option>
          </SelectField>
        </label>
        {categoryHint}
      </div>
      {value.category === 'scenario' && (
        <PublicationScenarioFields value={value} onChange={update} />
      )}
      <label>
        可见范围
        <SelectField
          optionIcons={audienceIcons}
          value={audienceMode}
          onValueChange={(nextValue) =>
            update({
              distribution: {
                mode: 'approved_audience',
                audience:
                  nextValue === 'restricted'
                    ? me?.groups[0]
                      ? [`group:${me.groups[0].id}`]
                      : []
                    : [nextValue],
              },
            })
          }
        >
          <option value="public">公开 · 无需登录</option>
          <option value="organization">所有登录用户</option>
          <option value="restricted">指定团队与成员</option>
        </SelectField>
      </label>
      {audienceMode === 'restricted' && (
        <fieldset data-review-target="audience" tabIndex={-1}>
          <legend>指定受众</legend>
          <div className={chipsStyles}>
            {[...audienceOptions].map(([id, name]) => (
              <label className={checkLabelStyles} key={id}>
                <input
                  type="checkbox"
                  checked={audience.includes(id)}
                  required={audience.length === 0}
                  onChange={(event) =>
                    update({
                      distribution: {
                        mode: 'approved_audience',
                        audience: event.target.checked
                          ? [...audience, id]
                          : audience.filter((item) => item !== id),
                      },
                    })
                  }
                />
                <span>{name}</span>
              </label>
            ))}
          </div>
          {!audience.length && <Message error>请至少选择一个受众。</Message>}
        </fieldset>
      )}
      {value.distribution.audience.includes('organization') && (
        <Message>所有登录用户可读取；需要来源共享授权与平台审核。</Message>
      )}
      {value.distribution.audience.includes('public') && (
        <Message>
          公开后任何人都可浏览、下载并通过对话安装。需要来源共享授权与独立平台审核。
        </Message>
      )}
      <small>分类用于发现，可见范围决定谁能读取。所有内容均需独立人工审核。</small>
    </div>
  );
}
