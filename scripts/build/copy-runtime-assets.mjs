import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../packages/infrastructure');
for (const dialect of ['sqlite', 'postgresql']) {
  await cp(
    resolve(root, 'src/persistence', dialect, 'migrations'),
    resolve(root, 'dist/persistence', dialect, 'migrations'),
    { recursive: true },
  );
}
