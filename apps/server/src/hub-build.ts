import { readFileSync } from 'node:fs';

const metadata = new URL(
  import.meta.url.endsWith('.ts') ? '../../../package.json' : './hub-build.json',
  import.meta.url,
);
const { version, commit } = JSON.parse(readFileSync(metadata, 'utf8')) as {
  version: string;
  commit?: string;
};

/** 部署只携带 dist；源码启动时从工作区读取发行版本。 */
export const hubBuild = { hub_version: version, hub_commit: commit ?? '' };
