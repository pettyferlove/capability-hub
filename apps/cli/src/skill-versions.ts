import { HubApiError, type HubApiClient } from './api-client.js';
import { assetSchema } from './response-schemas.js';

/** 当前发布被撤销时才查可读历史，调用方仍须单独匹配指定版本。 */
export async function readSkillAsset(api: HubApiClient, id: string) {
  const path = `/api/assets/${id}`;
  let query = '';
  let asset;
  try {
    asset = await api.json(path, assetSchema);
  } catch (error) {
    if (!(error instanceof HubApiError) || error.status !== 404) throw error;
    query = '?latest_readable=1';
    asset = await api.json(path + query, assetSchema);
  }
  return { asset, historyPath: `/api/assets/${asset.asset_id}/versions${query}` };
}

/** Git 来源的标签含完整提交与来源 ID；人读表格只保留短提交与来源修订，命令和 JSON 仍用完整标签。 */
export function displayVersionLabel(label: string) {
  const git = /^git\.([0-9a-f]{40,64})\.s[^.]+\.r(\d+)$/.exec(label);
  return git ? `git.${git[1].slice(0, 12)}….r${git[2]}` : label;
}
