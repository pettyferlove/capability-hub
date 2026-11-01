import type { OperationsResponse } from '@capability-hub/contracts/http';
import { bytesLabel, dateLabel } from '../../shared/format/labels.js';
import { cn } from '../../shared/styles/cn.js';
import {
  panelStyles,
  tagStyles,
  tagTealStyles,
  noticeErrorStyles,
} from '../../shared/styles/recipes.js';
import { operationsGridStyles } from './styles.js';

function StoragePanel({
  title,
  available,
  rows,
}: {
  title: string;
  available: boolean;
  rows: Record<string, string | number>;
}) {
  return (
    <section className={panelStyles} aria-label={title}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3>{title}</h3>
        <span className={cn(tagStyles, available ? tagTealStyles : noticeErrorStyles)}>
          {available ? '探测正常' : '探测失败'}
        </span>
      </div>
      <dl>
        {Object.entries(rows).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 存储探测与容量、备份各自读取，单项失败只影响对应读数。 */
export function OperationsStorage({ data }: { data: OperationsResponse }) {
  const { database, object_storage: objects } = data;
  return (
    <div className={operationsGridStyles}>
      <StoragePanel
        title="数据库"
        available={database.available}
        rows={{
          驱动: database.driver === 'sqlite' ? 'SQLite' : 'PostgreSQL',
          查询探测耗时: `${database.duration_ms} ms`,
          数据库大小: database.size_bytes === null ? '无法读取' : bytesLabel(database.size_bytes),
          ...(database.pool_limit === null ? {} : { 连接池上限: database.pool_limit }),
          最近备份: data.last_backup_at
            ? dateLabel(data.last_backup_at)
            : data.last_backup_at === null
              ? '暂无成功记录'
              : '无法读取',
        }}
      />
      <StoragePanel
        title="对象存储"
        available={objects.available}
        rows={{
          驱动: objects.driver === 'filesystem' ? '本地文件系统' : 'MinIO',
          读写探测耗时: `${objects.duration_ms} ms`,
          内容校验: 'SHA-256',
          ...(objects.driver === 'minio'
            ? {
                存储桶: objects.bucket,
                对象前缀: objects.prefix || '桶根目录',
                区域: objects.region,
              }
            : { 内容目录: '实例数据目录下的 blobs/' }),
        }}
      />
    </div>
  );
}
