import type { CliInstallationResponse } from '@capability-hub/contracts';
import { useQuery } from '../api/use-query.js';
import {
  installationContentStyles,
  installationRouteStyles,
  subtleStyles,
} from '../styles/recipes.js';
import { CodeBlock } from './CodeBlock.js';
import { ErrorState } from './ErrorState.js';
import { Loading } from './Loading.js';

/** 接入页和资源页使用同一实例的安装说明，仓库认证由使用者在本机完成。 */
export function CliInstallationGuide() {
  const { data, error } = useQuery<CliInstallationResponse>('/api/cli-installation');
  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading label="正在加载 CLI 安装说明…" />;
  return (
    <div className="grid min-w-0 gap-[var(--space-5)]" role="region" aria-label="CLI 安装说明">
      {data.steps.map((step) => {
        const content = (
          <>
            <p className={subtleStyles}>{step.description}</p>
            {step.command && <CodeBlock title={step.title} code={step.command} />}
          </>
        );
        return step.optional ? (
          <details key={step.title} className={installationRouteStyles}>
            <summary>{step.title}</summary>
            <div className={installationContentStyles}>{content}</div>
          </details>
        ) : (
          <section key={step.title} className={installationContentStyles} aria-label={step.title}>
            <h3>{step.title}</h3>
            {content}
          </section>
        );
      })}
      <details className={installationRouteStyles}>
        <summary>安装遇到问题</summary>
        <ul className="grid list-disc gap-2 pl-5">
          {data.troubleshooting.map((item) => (
            <li key={item} className={subtleStyles}>
              {item}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
