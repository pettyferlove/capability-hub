import {
  intakeScanReportStyles,
  intakeScanTitleStyles,
  intakeScanRiskStyles,
  intakeScanInfoStyles,
} from './styles.js';
import { tagStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { ScanResponse } from '@capability-hub/contracts/http';
import { ShieldCheck } from '../../shared/icons/lucide.js';
export function IntakeScan({ scan }: { scan: ScanResponse }) {
  const risks = scan.findings.filter((f) => f.severity !== 'info'),
    infos = scan.findings.filter((f) => f.severity === 'info');
  return (
    <div className={intakeScanReportStyles}>
      <div className={intakeScanTitleStyles}>
        <ShieldCheck size={15} />
        <strong>{scan.state === 'passed' ? '结构与静态校验完成' : '存在阻断项'}</strong>
        <small>{scan.ruleset_version}</small>
      </div>
      {risks.map((f) => (
        <div className={cn(intakeScanRiskStyles, `group/${f.severity}`)} key={f.id}>
          <span className={tagStyles}>{f.severity === 'block' ? '阻断' : '需确认'}</span>
          <div>
            <code>
              {f.file}:{f.line}
            </code>
            <p>{f.evidence_summary}</p>
          </div>
        </div>
      ))}
      {infos.length > 0 && (
        <details className={intakeScanInfoStyles}>
          <summary>{infos.length} 项脚本与打包说明</summary>
          <div>
            {infos.map((f) => (
              <p key={f.id}>
                <code>{f.file}</code>
                <span>{f.evidence_summary}</span>
              </p>
            ))}
          </div>
        </details>
      )}
      {!risks.length && !infos.length && (
        <small>本次检查未发现需要确认的静态提示；发布仍需独立人工审核。</small>
      )}
    </div>
  );
}
