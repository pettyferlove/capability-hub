import {
  intakeProgressStyles,
  isStoppedStyles,
  intakeProgressHeadingStyles,
  intakeProgressSymbolStyles,
  isProcessingStyles,
  intakeProgressSummaryStyles,
  intakeProgressMetaStyles,
  intakeProgressStepsStyles,
  intakeStepMarkerStyles,
  intakeStepContentStyles,
  intakeProgressNextStyles,
  intakeProgressWaitStyles,
} from './styles.js';
import { eyebrowStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { IntakeResponse } from '@capability-hub/contracts/http';
import {
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  ShieldCheck,
} from '../../shared/icons/lucide.js';
import { useEffect, useState } from 'react';
import type { IntakeConnection } from './use-intake-detail.js';

const steps = {
  received: { title: '内容已接收', detail: '原始内容已保存，等待后台开始校验。' },
  fetching: { title: '读取固定提交', detail: '从已固定的 Git 提交读取登记目标的内容。' },
  scanning: { title: '结构与静态检查', detail: '检查文件结构、内容规范与风险项，不执行包内脚本。' },
  snapshot: { title: '保存固定快照', detail: '保存文件清单、内容摘要与本次检查证据。' },
};
const duration = (milliseconds: number) => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};
const time = (value: string) => new Date(value).toLocaleTimeString('zh-CN', { hour12: false });

export function IntakeProgress({
  intake,
  connection = 'closed',
}: {
  intake: IntakeResponse;
  connection?: IntakeConnection;
}) {
  const [now, setNow] = useState(Date.now);
  const processing = ['received', 'fetching', 'scanning'].includes(intake.state);
  const inactive = intake.asset_lifecycle !== 'active';
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [processing]);
  const entries = intake.progress;
  const order = [entries[0].step, 'scanning', 'snapshot'] as const;
  const current = entries.at(-1)!;
  const stopped = ['failed', 'cancelled'].includes(intake.state);
  const blocked = intake.error_code === 'SCAN_BLOCKED';
  const title = processing
    ? intake.phase
    : intake.state === 'ready'
      ? '内容校验完成'
      : intake.state === 'cancelled'
        ? '处理已取消'
        : blocked
          ? '检查发现阻断项'
          : '本次处理未完成';
  const Icon = processing ? LoaderCircle : stopped ? CircleAlert : ShieldCheck;
  const elapsed = duration(
    (intake.finished_at ? Date.parse(intake.finished_at) : now) - Date.parse(intake.created_at),
  );
  return (
    <section
      className={cn(intakeProgressStyles, stopped ? isStoppedStyles : '')}
      aria-label="处理进度"
    >
      <div className={intakeProgressHeadingStyles}>
        <div className={cn(intakeProgressSymbolStyles, processing ? isProcessingStyles : '')}>
          <Icon size={23} aria-hidden="true" />
        </div>
        <div className={intakeProgressSummaryStyles} role="status" aria-live="polite">
          <span className={eyebrowStyles}>{processing ? '正在处理' : '处理结果'}</span>
          <h4>{title}</h4>
          <p>
            {processing
              ? connection === 'reconnecting'
                ? '连接中断，正在重连；后台处理会继续。'
                : connection === 'connecting'
                  ? '正在连接实时进度，后台处理会继续。'
                  : '进度实时更新，关闭此面板后仍会继续处理。'
              : intake.state === 'ready'
                ? '内容与检查证据已保存，发布状态见下方。'
                : (intake.error_message ?? '请检查处理结果后再继续。')}
          </p>
        </div>
      </div>
      <dl className={intakeProgressMetaStyles}>
        <div>
          <dt>接收版本</dt>
          <dd>{intake.version_label}</dd>
        </div>
        <div>
          <dt>{processing ? '已用时间' : '处理耗时'}</dt>
          <dd>
            <Clock3 size={12} aria-hidden="true" />
            {elapsed}
          </dd>
        </div>
      </dl>
      <ol className={intakeProgressStepsStyles} aria-label="校验步骤">
        {order.map((step, index) => {
          const entry = entries.find((item) => item.step === step);
          const next = entry ? entries[entries.indexOf(entry) + 1] : undefined;
          const failed =
            (stopped && current.step === step && !blocked) || (blocked && step === 'scanning');
          const complete =
            !!entry &&
            (step === 'received' || !!next || intake.state === 'ready' || blocked) &&
            !failed;
          const active = !!entry && step !== 'received' && current.step === step && processing;
          const status = failed ? '未通过' : complete ? '已完成' : active ? '进行中' : '等待中';
          const StepIcon = failed ? CircleAlert : complete ? Check : active ? LoaderCircle : null;
          return (
            <li
              key={step}
              data-state={failed ? 'failed' : complete ? 'complete' : active ? 'active' : 'waiting'}
              aria-current={active ? 'step' : undefined}
            >
              <span className={intakeStepMarkerStyles} aria-hidden="true">
                {StepIcon ? <StepIcon size={15} /> : String(index + 1).padStart(2, '0')}
              </span>
              <div className={intakeStepContentStyles}>
                <div>
                  <strong>{steps[step].title}</strong>
                  <span>{status}</span>
                </div>
                <p>{steps[step].detail}</p>
                {entry && (
                  <time dateTime={entry.started_at}>
                    {time(entry.started_at)}
                    {next
                      ? ` · ${duration(Date.parse(next.started_at) - Date.parse(entry.started_at))}`
                      : ''}
                  </time>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className={intakeProgressNextStyles}>
        <ShieldCheck size={15} aria-hidden="true" />
        <p>
          <strong>
            {inactive
              ? intake.asset_lifecycle === 'deprecated'
                ? '资产已弃用，暂停发布'
                : '资产已封禁，暂停发布'
              : intake.publication?.state === 'approved'
                ? '此内容已审核发布'
                : intake.publication?.state === 'pending'
                  ? '发布申请已提交，等待独立审核'
                  : intake.state === 'ready'
                    ? '下一步 · 确认范围并提交审核'
                    : '校验通过后才能提交审核'}
          </strong>
          <span>
            {inactive
              ? intake.publication?.state === 'approved'
                ? '此快照曾审核发布；恢复资产活动状态后才能申请新的分发。'
                : '本次接收和检查记录保留，恢复资产活动状态后才能继续申请发布。'
              : intake.publication?.state === 'approved'
                ? '可查看已发布内容，或重新申请调整分发范围。'
                : '校验通过后填写分类、可见范围和共享目的，由独立审核者决定是否发布。'}
          </span>
        </p>
      </div>
      {processing && now - Date.parse(intake.created_at) >= 120000 && (
        <p className={intakeProgressWaitStyles}>
          处理时间较长，可关闭面板，稍后从接收记录查看结果。
        </p>
      )}
    </section>
  );
}
