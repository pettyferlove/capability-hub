import {
  hubFeedbackAreas,
  hubFeedbackStatuses,
  hubFeedbackSurfaces,
} from '@capability-hub/contracts';
import type {
  HubFeedbackItemResponse,
  HubFeedbackListResponse,
} from '@capability-hub/contracts/http';
import { useEffect } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { DataTable } from '../../shared/components/DataTable.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { ServerPagination } from '../../shared/components/ServerPagination.js';
import { TableSkeleton } from '../../shared/components/Skeleton.js';
import { dateLabel } from '../../shared/format/labels.js';
import { MessageSquare } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { tagStyles } from '../../shared/styles/recipes.js';

export const feedbackChannels = { web: '网页', cli: 'CLI' } as const;
const desktopColumn = 'max-[760px]:hidden';

export function FeedbackStatus({ status }: Pick<HubFeedbackItemResponse, 'status'>) {
  return (
    <span
      className={cn(
        tagStyles,
        status === 'needs_info' && 'bg-warning-soft text-warning',
        status === 'in_progress' && 'bg-brand-soft text-brand',
        status === 'resolved' && 'bg-success-soft text-success',
      )}
    >
      {hubFeedbackStatuses[status]}
    </span>
  );
}

export function HubFeedbackList({
  handler = false,
  path,
  refresh,
  onRetry,
  hrefFor,
  onPageChange,
  empty,
}: {
  handler?: boolean;
  path: string;
  refresh: number;
  onRetry: () => void;
  hrefFor: (id: string) => string;
  onPageChange: (page: number, limit: number) => void;
  empty: { title: string; description: string };
}) {
  const label = handler ? '平台反馈' : '我的反馈';
  const { data, loading, isPreviousData, error, errorStatus, errorRequestId, errorFailure } =
    useQuery<HubFeedbackListResponse>(path, refresh, { keepPreviousData: handler });
  const page = data?.page;
  const limit = data?.limit;
  const total = data?.total;
  const lastPage = limit && total !== undefined ? Math.max(1, Math.ceil(total / limit)) : 1;
  const outOfRange = page !== undefined && page > lastPage;
  useEffect(() => {
    if (!loading && outOfRange && limit !== undefined) onPageChange(lastPage, limit);
  }, [lastPage, limit, loading, onPageChange, outOfRange]);

  return (
    <QueryRegion
      label={label + '查询结果'}
      loading={loading}
      isPreviousData={isPreviousData}
      showProgress={!!data}
    >
      {error ? (
        <ErrorState
          message={error}
          status={errorStatus}
          requestId={errorRequestId}
          failure={errorFailure}
          retry={onRetry}
        />
      ) : !data || outOfRange ? (
        <TableSkeleton label="正在加载反馈…" rows={5} columns={handler ? 7 : 4} paginated />
      ) : data.total === 0 ? (
        <Empty title={empty.title} icon={<MessageSquare size={24} aria-hidden="true" />}>
          {empty.description}
        </Empty>
      ) : (
        <>
          <DataTable label={label} searchable={false}>
            <table className="max-[760px]:min-w-0!">
              <thead>
                <tr>
                  <th scope="col" className={desktopColumn}>
                    编号
                  </th>
                  <th scope="col">标题</th>
                  {handler && (
                    <>
                      <th scope="col" className={desktopColumn}>
                        位置 / 模块
                      </th>
                      <th scope="col" className={desktopColumn}>
                        提交人
                      </th>
                      <th scope="col" className={desktopColumn}>
                        渠道
                      </th>
                    </>
                  )}
                  <th scope="col" className="max-[760px]:w-26">
                    状态
                  </th>
                  <th scope="col" className={desktopColumn}>
                    最近活动
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td className={cn(desktopColumn, 'tabular-nums')}>#{item.number}</td>
                    <td>
                      <div className="flex min-w-0 items-baseline gap-2 [overflow-wrap:anywhere]">
                        {!handler && item.unread && (
                          <>
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-full bg-brand"
                            />
                            <span className="sr-only">未读</span>
                          </>
                        )}
                        <a
                          href={hrefFor(item.id)}
                          className="font-medium text-brand hover:underline"
                        >
                          {item.title}
                        </a>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-caption tabular-nums text-muted-ink min-[760px]:hidden">
                        <span>#{item.number}</span>
                        {handler && item.submitter && <span>{item.submitter.display_name}</span>}
                        <time dateTime={item.last_activity_at}>
                          {dateLabel(item.last_activity_at)}
                        </time>
                      </div>
                    </td>
                    {handler && (
                      <td className={desktopColumn}>
                        {hubFeedbackSurfaces[item.surface]}
                        {item.area && ` / ${hubFeedbackAreas[item.area]}`}
                      </td>
                    )}
                    {handler && (
                      <td className={desktopColumn}>
                        {item.submitter?.display_name ?? '账号不可用'}
                      </td>
                    )}
                    {handler && <td className={desktopColumn}>{feedbackChannels[item.channel]}</td>}
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FeedbackStatus status={item.status} />
                        {handler && item.awaiting_reply && (
                          <span className={tagStyles}>待回复</span>
                        )}
                      </div>
                    </td>
                    <td className={desktopColumn}>
                      <time
                        className="whitespace-nowrap tabular-nums"
                        dateTime={item.last_activity_at}
                      >
                        {dateLabel(item.last_activity_at)}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <ServerPagination
            label={label}
            page={data.page}
            pageSize={data.limit}
            total={data.total}
            disabled={loading}
            onChange={onPageChange}
          />
        </>
      )}
    </QueryRegion>
  );
}
