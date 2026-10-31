import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const serviceRoot = fileURLToPath(new URL('../../', import.meta.url));
function findWorkspace(): string {
  for (let directory = serviceRoot; ; directory = dirname(directory)) {
    if (existsSync(resolve(directory, 'pnpm-workspace.yaml'))) return directory;
    if (dirname(directory) === directory) return serviceRoot;
  }
}
/** 源码和 dist 均从包位置解析；部署包没有 workspace 时以服务目录为根。 */
export const workspaceRoot = findWorkspace();
export const defaultDataDirectory = resolve(workspaceRoot, '.data');
export const defaultWebDirectory = resolve(
  workspaceRoot,
  workspaceRoot === serviceRoot ? 'web' : 'apps/web/dist',
);
