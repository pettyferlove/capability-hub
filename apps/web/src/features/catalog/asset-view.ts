import type { AssetResponse, AssetVersionResponse } from '@capability-hub/contracts/http';

/** 当前发布与固定版本详情共有的资产字段；发布信息另由 {@link AssetView.release} 给出。 */
export type AssetDetail = Omit<AssetResponse, 'current_release' | 'match_reasons'>;

/** 详情抽屉本次展示的发布，文件、安装与反馈都锁定到它。 */
export type AssetRelease = AssetResponse['current_release'];

/**
 * 详情正文的视图模型：把展示的发布与资产当前发布分开传递，固定版本不伪造 `current_release`。
 */
export interface AssetView {
  asset: AssetDetail;
  release: AssetRelease;
  /** 当前主体可读的最新发布版本；固定版本视图下可能与 `release` 不同，读不到时为 `null`。 */
  latestVersionId: string | null;
  /** 当前发布不可读时，按当前目录查找安装项的 MCP CLI 无法生成固定版配置。 */
  currentReadable: boolean;
  /** 匿名可读才给公开对话安装入口。 */
  publicReadable: boolean;
  /** 仅当前发布视图保留原响应：推荐与提名作用于资产当前发布，固定版本不展示。 */
  current?: AssetResponse;
}

/** 当前发布沿用原规则：发布受众含 `public` 即视为公开。 */
export function currentAssetView(asset: AssetResponse): AssetView {
  return {
    asset,
    release: asset.current_release,
    latestVersionId: asset.current_release.version_id,
    currentReadable: true,
    publicReadable: asset.current_release.distribution.audience.includes('public'),
    current: asset,
  };
}

/** 固定版本的公开性由服务端按当前与历史双重受众计算，不能只看该发布的受众。 */
export function fixedAssetView(asset: AssetVersionResponse): AssetView {
  return {
    asset,
    release: asset.release,
    latestVersionId: asset.latest_release?.version_id ?? null,
    currentReadable: asset.current_readable,
    publicReadable: asset.public_readable,
  };
}
