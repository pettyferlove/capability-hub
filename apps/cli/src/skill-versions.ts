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
