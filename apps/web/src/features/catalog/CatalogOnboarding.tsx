import type { RefObject } from 'react';
import { Bot, FolderOpen, LogIn, UploadCloud } from '../../shared/icons/lucide.js';
import { DotGrid } from '../../shared/components/react-bits/DotGrid.js';
import { useHub } from '../../shared/context/HubContext.js';
import { loginHref } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';
import { btnPrimaryStyles, btnStyles } from '../../shared/styles/recipes.js';
import {
  onboardingActionsStyles,
  onboardingBeamStyles,
  onboardingCopyStyles,
  onboardingDotsStyles,
  onboardingFlowStyles,
  onboardingIconStyles,
  onboardingStepIndexStyles,
  onboardingStepStyles,
  onboardingStepsStyles,
  onboardingStepTextStyles,
  onboardingStepTitleStyles,
  onboardingStyles,
  onboardingTextStyles,
  onboardingTitleStyles,
  onboardingTrackStyles,
} from './styles.js';

const steps = [
  { title: '发布', text: '维护者上传 Skill 包或 MCP 的 server.json' },
  { title: '审核', text: '审核者核对内容、脚本与共享范围' },
  { title: '使用', text: '在首页问到资源，按接入方式装进 Agent' },
];

/**
 * 目录对当前访问者为空时，替代资源横条与目录：说明资源从发布、审核到可用的路径，并按身份给出下一步。
 * 未登录引导登录查看团队资源，可发布者直达发布页，其余身份先接入 Agent。
 * 标题承接「浏览资源目录」的跳转与焦点。
 */
export function CatalogOnboarding({
  headingRef,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { me } = useHub();
  const canPublish = !!me?.capabilities.can_publish;
  const connect = (
    <a className={cn(btnStyles, me && !canPublish && btnPrimaryStyles)} href="/connect">
      <Bot size={16} />
      接入 Agent
    </a>
  );
  return (
    <section className={onboardingStyles} aria-labelledby="directory-title">
      <DotGrid className={onboardingDotsStyles} />
      <div className={onboardingCopyStyles}>
        <span className={onboardingIconStyles} aria-hidden="true">
          <FolderOpen size={22} />
        </span>
        <h2 ref={headingRef} tabIndex={-1} id="directory-title" className={onboardingTitleStyles}>
          {!me ? '还没有公开的 Skill 或 MCP' : canPublish ? '目录还是空的' : '还没有向你开放的资源'}
        </h2>
        <p className={onboardingTextStyles}>
          {!me
            ? '团队内部共享的资源需要登录后查看。资源发布并通过审核后，会出现在这里，也能在上面的输入框里找到。'
            : canPublish
              ? '发布第一个 Skill 或 MCP，审核通过后会出现在这里，也能在上面的输入框里找到。'
              : '维护者发布并通过审核后，资源会出现在这里。先接入 Agent，资源上线后就能直接安装。'}
        </p>
        <div className={onboardingActionsStyles}>
          {!me ? (
            <a className={cn(btnStyles, btnPrimaryStyles)} href={loginHref()}>
              <LogIn size={16} />
              登录查看团队资源
            </a>
          ) : (
            canPublish && (
              <a className={cn(btnStyles, btnPrimaryStyles)} href="/publish">
                <UploadCloud size={16} />
                发布资源
              </a>
            )
          )}
          {connect}
        </div>
      </div>
      <div className={onboardingFlowStyles}>
        <span className={onboardingTrackStyles} aria-hidden="true">
          <span className={onboardingBeamStyles} />
        </span>
        <ol className={onboardingStepsStyles} aria-label="资源上线的过程">
          {steps.map((step, index) => (
            <li key={step.title} className={onboardingStepStyles}>
              <span className={onboardingStepIndexStyles} aria-hidden="true">
                {index + 1}
              </span>
              <span>
                <strong className={onboardingStepTitleStyles}>{step.title}</strong>
                <span className={onboardingStepTextStyles}>{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
