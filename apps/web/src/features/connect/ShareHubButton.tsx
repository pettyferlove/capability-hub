import { btnStyles, iconBtnStyles } from '../../shared/styles/recipes.js';
import {
  hubShareTriggerStyles,
  hubShareSceneStyles,
  hubShareCloseStyles,
  hubSharePassStyles,
  hubPassLanyardStyles,
  hubPassRibbonStyles,
  hubPassRibbonTealStyles,
  hubPassRibbonMistStyles,
  hubPassRingStyles,
  hubPassClaspStyles,
  hubShareCardStyles,
  hubPassSlotStyles,
  hubPassHeadingStyles,
  hubPassStatusStyles,
  hubShareArtStyles,
  hubArtGridStyles,
  hubArtWordmarkStyles,
  hubArtOrbitStyles,
  hubArtOrbitOneStyles,
  hubArtOrbitTwoStyles,
  hubArtTileStyles,
  hubArtTileSkillStyles,
  hubArtCoreStyles,
  hubArtTileMcpStyles,
  hubArtStarStyles,
  hubArtCaptionStyles,
  hubShareIntroStyles,
  hubShareEyebrowStyles,
  hubShareDescriptionStyles,
  hubPassPerforationStyles,
  hubShareLoadingStyles,
  hubSharePromptStyles,
  hubSharePromptLabelStyles,
  hubShareGuideStyles,
  hubPassFooterStyles,
  hubPassBrandStyles,
  hubPassStampStyles,
  hubShareFooterStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { hubShareResponseSchema } from '@capability-hub/contracts';
import { ArrowUpRight, Braces, Share2, Sparkles, Workflow, X } from '../../shared/icons/lucide.js';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useState, type PointerEvent } from 'react';
import { Button } from 'react-aria-components';
import { useQuery } from '../../shared/api/use-query.js';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { Overlay } from '../../shared/components/Overlay.js';

export function ShareHubButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        className={cn(btnStyles, hubShareTriggerStyles)}
        aria-label="分享 Hub"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPress={() => setOpen(true)}
      >
        <Share2 size={16} aria-hidden="true" />
        <span>分享 Hub</span>
      </Button>
      <Overlay open={open} onClose={() => setOpen(false)} label="分享 Hub" variant="showcase">
        <ShareHubInvitation onClose={() => setOpen(false)} />
      </Overlay>
    </>
  );
}

function ShareHubInvitation({ onClose }: { onClose: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const reduceMotion = useReducedMotion();
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 160, damping: 24 });
  const rotateY = useSpring(tiltY, { stiffness: 160, damping: 24 });
  const resetTilt = () => {
    tiltX.set(0);
    tiltY.set(0);
  };
  const tilt = (event: PointerEvent<HTMLElement>) => {
    if (reduceMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    tiltX.set((0.5 - (event.clientY - bounds.top) / bounds.height) * 5);
    tiltY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 7);
  };
  const { data, loading, error } = useQuery<unknown>('/api/hub-share', refresh);
  const parsed = hubShareResponseSchema.safeParse(data);
  const invitation = parsed.success ? parsed.data : undefined;
  return (
    <section
      className={hubShareSceneStyles}
      onPointerMove={tilt}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <button
        type="button"
        className={cn(iconBtnStyles, hubShareCloseStyles)}
        aria-label="关闭"
        onClick={onClose}
      >
        <X size={20} aria-hidden="true" />
      </button>
      <motion.div
        className={hubSharePassStyles}
        style={{ rotateX: reduceMotion ? 0 : rotateX, rotateY: reduceMotion ? 0 : rotateY }}
      >
        <div className={hubPassLanyardStyles} aria-hidden="true">
          <span className={cn(hubPassRibbonStyles, hubPassRibbonTealStyles)}>
            <span>CAPABILITY HUB ✦ CAPABILITY HUB</span>
          </span>
          <span className={cn(hubPassRibbonStyles, hubPassRibbonMistStyles)}>
            <span>PASS IT ON ✦ PASS IT ON</span>
          </span>
          <span className={hubPassRingStyles} />
          <span className={hubPassClaspStyles}>
            <i />
          </span>
        </div>
        <div className={hubShareCardStyles}>
          <div className={hubPassSlotStyles} aria-hidden="true" />
          <div className={hubPassHeadingStyles}>
            <span>
              <span className={hubPassStatusStyles} /> CAPABILITY HUB
            </span>
            <span>
              一份开放的邀请 <ArrowUpRight size={12} aria-hidden="true" />
            </span>
          </div>
          <div className={hubShareArtStyles} aria-hidden="true">
            <div className={hubArtGridStyles} />
            <span className={hubArtWordmarkStyles}>HUB</span>
            <span className={cn(hubArtOrbitStyles, hubArtOrbitOneStyles)} />
            <span className={cn(hubArtOrbitStyles, hubArtOrbitTwoStyles)} />
            <span className={cn(hubArtTileStyles, hubArtTileSkillStyles)}>
              <Braces size={24} />
              <small>SKILL</small>
            </span>
            <span className={hubArtCoreStyles}>
              <Glyph seed="capability-hub" kind="skill" size={82} animate={false} />
            </span>
            <span className={cn(hubArtTileStyles, hubArtTileMcpStyles)}>
              <Workflow size={24} />
              <small>MCP</small>
            </span>
            <span className={hubArtStarStyles}>
              <Sparkles size={20} />
            </span>
            <div className={hubArtCaptionStyles}>
              <span>LESS FRICTION.</span>
              <span>MORE POSSIBILITY. ↗</span>
            </div>
          </div>
          <div className={hubShareIntroStyles}>
            <p className={hubShareEyebrowStyles}>THE NEXT GREAT THING IS SHARED</p>
            <h2>
              好用的能力，
              <br />
              <span>值得被传递。</span>
            </h2>
            <p className={hubShareDescriptionStyles}>把 Skill 与 MCP，带进下一位创造者的工作流。</p>
          </div>
          <div className={hubPassPerforationStyles} aria-hidden="true">
            <span />
            <Sparkles size={13} />
            <span />
          </div>
          <div aria-busy={loading}>
            {loading ? (
              <p role="status" className={hubShareLoadingStyles}>
                正在准备邀请…
              </p>
            ) : error || !invitation ? (
              <ErrorState
                message={error || '邀请暂时不可用，请重新加载'}
                retry={() => setRefresh(refresh + 1)}
              />
            ) : (
              <>
                <div className={hubSharePromptStyles}>
                  <span className={hubSharePromptLabelStyles}>
                    <span>你的邀请，已经写好</span>
                    <span>JUST COPY & GO ↗</span>
                  </span>
                  <p>{invitation.prompt}</p>
                </div>
                <CopyButton text={invitation.prompt} label="复制邀请" variant="primary" />
                <a
                  className={hubShareGuideStyles}
                  href={invitation.installation_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看公开接入说明 <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </>
            )}
          </div>
          <footer className={hubPassFooterStyles}>
            <span className={hubPassBrandStyles}>
              <Glyph seed="capability-hub" kind="skill" size={22} animate={false} />
              <span>
                Capability Hub<small>让能力流动，让创造发生</small>
              </span>
            </span>
            <span className={hubPassStampStyles} aria-hidden="true">
              PASS IT
              <br />
              <strong>FORWARD ↗</strong>
            </span>
          </footer>
        </div>
      </motion.div>
      <p className={hubShareFooterStyles}>发给朋友，或粘贴到自己的 Agent 对话中</p>
    </section>
  );
}
