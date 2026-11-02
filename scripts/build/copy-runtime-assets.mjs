import { cp } from 'node:fs/promises';
import { resolve } from 'node:path';

if (process.argv[2] === 'server') {
  const root = resolve(import.meta.dirname, '../..');
  await cp(resolve(root, 'skills'), resolve(root, 'apps/server/dist/skills'), { recursive: true });
} else {
  const root = resolve(import.meta.dirname, '../../packages/infrastructure');
  await cp(
    resolve(root, 'src/security/ssh-askpass.sh'),
    resolve(root, 'dist/security/ssh-askpass.sh'),
  );
  for (const dialect of ['sqlite', 'postgresql']) {
    await cp(
      resolve(root, 'src/persistence', dialect, 'migrations'),
      resolve(root, 'dist/persistence', dialect, 'migrations'),
      { recursive: true },
    );
  }
}
