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

export function CardGridSkeleton({
  label = '正在加载资产…',
  count = 3,
  variant = 'asset',
}: {
  label?: string;
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

export function TableSkeleton({
  label = '正在加载表格…',
  rows = 5,
  columns = 4,
}: {
  label?: string;
  rows?: number;
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

export function CodeSkeleton({ label = '正在读取固定版本内容…' }: { label?: string }) {
  return (
    <SkeletonRegion label={label}>
      <CodePlaceholder />
    </SkeletonRegion>
  );
}

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

export function PageSkeleton({
  title,
  variant = 'cards',
}: {
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
