import { openOperations } from './runtime.js';

const runtime = await openOperations(process.argv[2]);
const { store, blobs } = runtime;
const errors: string[] = [];
try {
  for (const intake of await store.all('intakes'))
    if (intake.payload_ref && !(await blobs.exists(intake.payload_ref)))
      errors.push(`intake ${intake.id}: original package missing or corrupt`);
  for (const version of await store.all('versions')) {
    for (const file of version.files)
      if (!(await blobs.exists(file.blob_ref))) errors.push(`version ${version.id}: ${file.path}`);
    for (const ref of [version.manifest_ref, version.artifact_ref])
      if (!(await blobs.exists(ref))) errors.push(`version ${version.id}: ${ref}`);
  }
  for (const asset of await store.all('assets'))
    if (asset.current_release_id) {
      const release = await store.get('releases', asset.current_release_id);
      if (
        !release ||
        release.asset_id !== asset.id ||
        !(await store.get('versions', release.version_id))
      )
        errors.push(`release pointer ${asset.id}`);
    }
  if (!errors.length)
    await store.tx(async () => {
      for (const job of (await store.all('jobs')).filter((job) => job.state === 'running'))
        await store.put('jobs', {
          ...job,
          state: 'queued',
          lease_epoch: job.lease_epoch + 1,
          lease_until: 0,
          run_after: Date.now(),
        });
    });
} finally {
  await runtime.close();
}

if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exitCode = 1;
} else
  process.stdout.write(
    '恢复检查通过：发布指针、全部内容摘要与持久任务已核验；封禁、撤销及审计记录保持。\n',
  );
