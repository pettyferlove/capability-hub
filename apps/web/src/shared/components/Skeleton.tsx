import {
  skeletonBlockStyles,
  shapeCircleStyles,
  shapeRectStyles,
  skeletonRegionStyles,
  skeletonContentStyles,
  skeletonLinesStyles,
  skeletonCardGridStyles,
  skeletonCardGridAssetStyles,
  skeletonCardGridStatStyles,
  skeletonCardGridSourceStyles,
  skeletonCardGridRoleStyles,
  skeletonCardStyles,
  skeletonCardHeaderStyles,
  skeletonCardTagsStyles,
  skeletonCardFooterStyles,
  skeletonTableStyles,
  skeletonTableToolbarStyles,
  skeletonTableHeadStyles,
  skeletonTableRowStyles,
  skeletonListStyles,
  skeletonListRowStyles,
  skeletonFormStyles,
  skeletonFieldStyles,
  skeletonFormActionStyles,
  skeletonSummaryStyles,
  skeletonSummaryRowStyles,
  skeletonProfileBannerStyles,
  skeletonProfileGridStyles,
  skeletonProfileSideStyles,
  skeletonCodeStyles,
  skeletonCodeLineStyles,
  skeletonDetailStyles,
  skeletonDetailHeadingStyles,
  skeletonDetailMetaStyles,
  skeletonTabsStyles,
  skeletonReviewStyles,
  skeletonReviewInboxStyles,
  skeletonReviewStageStyles,
  skeletonPageStyles,
  skeletonPageHeadingStyles,
  skeletonPageEyebrowStyles,
  skeletonPageDescriptionStyles,
  formStackStyles,
  skeletonPublishStyles,
  connectLayoutStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import type { CSSProperties, ReactNode } from 'react';
import { useLoadingDelay } from './LoadingScope.js';

function SkeletonBlock({
  width = '100%',
  height = 12,
  shape = 'line',
  className = '',
}: {
  width?: CSSProperties['width'];
  height?: number;
  shape?: 'line' | 'circle' | 'rect';
  className?: string;
}) {
  return (
    <span
      className={cn(
        skeletonBlockStyles,
        { line: '', circle: shapeCircleStyles, rect: shapeRectStyles }[shape],
        className,
      )}
      style={{ width, height }}
    />
  );
}

function SkeletonRegion({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const visible = useLoadingDelay();
  return (
    <div
      className={cn(skeletonRegionStyles, className)}
      role="status"
      aria-busy="true"
      data-loading-visible={visible}
    >
      <span className="sr-only">{label}</span>
      <div className={skeletonContentStyles} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function Lines({ count = 3 }: { count?: number }) {
  const widths = ['92%', '100%', '76%', '88%', '64%'];
  return (
    <div className={skeletonLinesStyles}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} width={widths[i % widths.length]} />
      ))}
    </div>
  );
}

/**
 * 卡片网格占位；`variant` 决定单卡内部的骨架形状（`asset` 带标签行、`source` 带来源结构、
 * `role` 为角色行、`stat` 为指标数字），应与真实网格的变体保持一致，否则加载完成会明显跳一下。
 * 可见性同样走 180ms 延迟，短暂加载不会闪出骨架。
 */
export function CardGridSkeleton({
  label = '正在加载资产…',
  count = 3,
  variant = 'asset',
}: {
  /** 读屏播报文案，缺省「正在加载资产…」。 */
  label?: string;
  /** 占位卡片数量，默认 3；不参与布局计算，只影响观感，通常传一屏可见数量。 */
  count?: number;
  variant?: 'asset' | 'source' | 'role' | 'stat';
}) {
  return (
    <SkeletonRegion label={label}>
      <div
        className={cn(
          skeletonCardGridStyles,
          {
            asset: skeletonCardGridAssetStyles,
            stat: skeletonCardGridStatStyles,
            source: skeletonCardGridSourceStyles,
            role: skeletonCardGridRoleStyles,
          }[variant],
        )}
      >
        {Array.from({ length: count }, (_, i) => (
          <div className={skeletonCardStyles} key={i}>
            {variant === 'stat' ? (
              <>
                <SkeletonBlock width="44%" />
                <SkeletonBlock width="36%" height={30} />
                <SkeletonBlock width="78%" height={11} />
              </>
            ) : variant === 'role' ? (
              <>
                <div className={skeletonCardHeaderStyles}>
                  <SkeletonBlock width={22} height={22} shape="rect" />
                  <SkeletonBlock width="44%" />
                  <SkeletonBlock width={32} height={18} />
                </div>
                <Lines count={2} />
              </>
            ) : (
              <>
                <div className={skeletonCardHeaderStyles}>
                  <SkeletonBlock width={36} height={36} shape="rect" />
                  <div className={skeletonLinesStyles}>
                    <SkeletonBlock width="42%" height={10} />
                    <SkeletonBlock width="76%" height={15} />
                  </div>
                </div>
                <Lines />
                {variant === 'asset' && (
                  <div className={skeletonCardTagsStyles}>
                    <SkeletonBlock width={56} height={24} shape="rect" />
                    <SkeletonBlock width={72} height={24} shape="rect" />
                  </div>
                )}
                <div className={skeletonCardFooterStyles}>
                  <SkeletonBlock width="36%" height={18} />
                  <SkeletonBlock width="24%" height={18} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/**
 * 表格占位；列数写入 CSS 变量 `--skeleton-columns` 由样式决定栅格。
 * 单元格宽度按行列错位变化，避免骨架呈现严格等宽网格被误认为真实数据。
 */
export function TableSkeleton({
  label = '正在加载表格…',
  rows = 5,
  columns = 4,
}: {
  label?: string;
  /** 占位行数，默认 5；只是视觉密度，与真实分页大小无关。 */
  rows?: number;
  /** 列数，默认 4；必须与真实表头列数一致，否则切换时会横向跳动。 */
  columns?: number;
}) {
  const cells = Array.from({ length: columns }, (_, i) => i);
  return (
    <SkeletonRegion label={label}>
      <div
        className={skeletonTableStyles}
        style={{ '--skeleton-columns': columns } as CSSProperties}
      >
        <div className={skeletonTableToolbarStyles}>
          <SkeletonBlock width={108} />
          <SkeletonBlock width={64} height={10} />
        </div>
        <div className={skeletonTableHeadStyles}>
          {cells.map((i) => (
            <SkeletonBlock key={i} width="48%" height={10} />
          ))}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div className={skeletonTableRowStyles} key={row}>
            {cells.map((column) => (
              <SkeletonBlock key={column} width={`${64 + ((row + column) % 3) * 12}%`} />
            ))}
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

function ListPlaceholder({ rows }: { rows: number }) {
  return (
    <div className={skeletonListStyles}>
      {Array.from({ length: rows }, (_, i) => (
        <div className={skeletonListRowStyles} key={i}>
          <SkeletonBlock width={32} height={32} shape="rect" />
          <div className={skeletonLinesStyles}>
            <SkeletonBlock width={i % 2 ? '64%' : '78%'} />
            <SkeletonBlock width="42%" height={10} />
          </div>
          <SkeletonBlock width={56} height={20} shape="rect" />
        </div>
      ))}
    </div>
  );
}

/** 列表行占位（图标块 + 两行文字 + 尾部按钮），用于记录流；`rows` 默认 3，行序不影响语义。 */
export function ListSkeleton({
  label = '正在加载记录…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <SkeletonRegion label={label}>
      <ListPlaceholder rows={rows} />
    </SkeletonRegion>
  );
}

function FormPlaceholder({ fields, action = true }: { fields: number; action?: boolean }) {
  return (
    <div className={skeletonFormStyles}>
      {Array.from({ length: fields }, (_, i) => (
        <div className={skeletonFieldStyles} key={i}>
          <SkeletonBlock width={60 + (i % 3) * 12} height={11} />
          <SkeletonBlock height={40} shape="rect" />
        </div>
      ))}
      {action && (
        <SkeletonBlock className={skeletonFormActionStyles} width={112} height={40} shape="rect" />
      )}
    </div>
  );
}

/** 键值摘要占位（左标签、右取值）；`rows` 默认 5，宽度错位，用于状态面板类区块。 */
export function SummarySkeleton({
  label = '正在加载状态…',
  rows = 5,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <SkeletonRegion label={label}>
      <div className={skeletonSummaryStyles}>
        <SkeletonBlock width={156} height={16} />
        {Array.from({ length: rows }, (_, i) => (
          <div className={skeletonSummaryRowStyles} key={i}>
            <SkeletonBlock width={`${40 + (i % 3) * 7}%`} />
            <SkeletonBlock width="20%" />
          </div>
        ))}
        <SkeletonBlock width="94%" height={10} />
      </div>
    </SkeletonRegion>
  );
}

/** 个人中心布局占位：上方资料横幅 + 左侧表单卡 + 右侧列表与说明卡，比例需与真实页面一致。 */
export function ProfileSkeleton() {
  return (
    <SkeletonRegion label="正在加载个人资料…">
      <div className={skeletonProfileBannerStyles}>
        <SkeletonBlock width={56} height={56} shape="circle" />
        <Lines count={2} />
        <SkeletonBlock width={144} height={36} shape="rect" />
      </div>
      <div className={skeletonProfileGridStyles}>
        <div className={skeletonCardStyles}>
          <FormPlaceholder fields={5} />
        </div>
        <div className={skeletonProfileSideStyles}>
          <div className={skeletonCardStyles}>
            <ListPlaceholder rows={3} />
          </div>
          <div className={skeletonCardStyles}>
            <Lines count={4} />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

function CodePlaceholder({ lines = 12 }: { lines?: number }) {
  const widths = ['36%', '58%', '48%', '72%', '24%', '64%', '44%', '78%'];
  return (
    <div className={skeletonCodeStyles}>
      {Array.from({ length: lines }, (_, i) => (
        <div className={skeletonCodeLineStyles} key={i}>
          <SkeletonBlock width={14} height={10} />
          <SkeletonBlock width={widths[i % widths.length]} height={11} />
        </div>
      ))}
    </div>
  );
}

/** 代码区占位（行号块 + 长短交错的行），用于固定版本文件预览；行数是观感值，与文件真实行数无关。 */
export function CodeSkeleton({ label = '正在读取固定版本内容…' }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <CodePlaceholder />
    </SkeletonRegion>
  );
}

/** 资产详情抽屉占位：标题块 + 元信息宫格 + 标签条 + 正文行，结构与详情页一致以避免打开时跳动。 */
export function DetailSkeleton() {
  return (
    <SkeletonRegion label="正在加载资产详情…">
      <div className={skeletonDetailStyles}>
        <div className={skeletonDetailHeadingStyles}>
          <SkeletonBlock width={52} height={52} shape="rect" />
          <Lines count={2} />
        </div>
        <Lines count={3} />
        <div className={skeletonDetailMetaStyles}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={56} shape="rect" />
          ))}
        </div>
        <SkeletonBlock height={64} shape="rect" />
        <SkeletonBlock className={skeletonTabsStyles} width="66%" height={32} />
        <Lines count={7} />
      </div>
    </SkeletonRegion>
  );
}

/** 审核工作台占位：左收件箱列表 + 右侧决策卡与代码预览，比例需与真实两栏一致。 */
export function ReviewSkeleton() {
  return (
    <SkeletonRegion label="正在加载审核队列…">
      <div className={skeletonReviewStyles}>
        <div className={skeletonReviewInboxStyles}>
          <ListPlaceholder rows={3} />
        </div>
        <div className={skeletonReviewStageStyles}>
          <div className={skeletonCardStyles}>
            <SkeletonBlock width="52%" height={22} />
            <Lines count={2} />
            <SkeletonBlock className={skeletonTabsStyles} width="48%" height={30} />
          </div>
          <div className={skeletonCardStyles}>
            <CodePlaceholder />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}

/**
 * 页面级占位：`variant` 逐一对应真实页面布局（`roles` 与 `profile` 是个人中心的两个子视图）。
 * 标题在骨架阶段就渲染真实 `<h1>`，让标题立即可见并减少懒加载组件到达后的位移；
 * 该 `h1` 与页面自身的 {@link PageHead} 不会同时出现，因为二者处于互斥的渲染分支。
 */
export function PageSkeleton({
  title,
  variant = 'cards',
}: {
  /** 真实页面标题，直接作为骨架的 `h1` 与读屏文案。 */
  title: string;
  variant?: 'cards' | 'table' | 'review' | 'connect' | 'publish' | 'profile' | 'roles';
}) {
  return (
    <SkeletonRegion label={'正在加载' + title + '…'} className={skeletonPageStyles}>
      <div className={skeletonPageHeadingStyles}>
        <div className={skeletonPageEyebrowStyles} aria-hidden="true">
          <SkeletonBlock width={140} height={18} />
        </div>
        <h1>{title}</h1>
        <div className={skeletonPageDescriptionStyles} aria-hidden="true">
          <SkeletonBlock width="42%" />
        </div>
      </div>
      {variant === 'profile' ? (
        <ProfileSkeleton />
      ) : variant === 'roles' ? (
        <div className={formStackStyles}>
          <CardGridSkeleton label="正在加载角色定义…" count={4} variant="role" />
          <TableSkeleton label="正在加载角色授权…" />
        </div>
      ) : variant === 'publish' ? (
        <SkeletonRegion label="正在加载发布工作区…">
          <div className={skeletonPublishStyles}>
            <SkeletonBlock className={skeletonTabsStyles} width="46%" height={32} />
            <div className={skeletonCardStyles}>
              <FormPlaceholder fields={3} action={false} />
              <SkeletonBlock height={160} shape="rect" />
              <SkeletonBlock width={144} height={40} shape="rect" />
            </div>
            <div className={skeletonCardStyles}>
              <ListPlaceholder rows={4} />
            </div>
          </div>
        </SkeletonRegion>
      ) : variant === 'review' ? (
        <ReviewSkeleton />
      ) : variant === 'table' ? (
        <TableSkeleton label={'正在加载' + title + '…'} />
      ) : variant === 'connect' ? (
        <div className={connectLayoutStyles}>
          <div className={skeletonCardStyles}>
            <CodeSkeleton label="正在加载接入配置…" />
          </div>
          <div className={skeletonCardStyles}>
            <ListSkeleton label="正在加载接入说明…" rows={5} />
          </div>
        </div>
      ) : (
        <CardGridSkeleton label={'正在加载' + title + '…'} />
      )}
    </SkeletonRegion>
  );
}
