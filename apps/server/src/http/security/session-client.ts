import type { SessionClientInfo } from '@capability-hub/contracts';
import Bowser from 'bowser';

const browserNames = new Set(Object.values(Bowser.BROWSER_MAP));

/** 登录时采集的展示信息，不作为设备身份或认证依据。 */
export function readSessionClient(userAgent: string | undefined): SessionClientInfo | null {
  if (!userAgent) return null;
  const { browser, os, platform } = Bowser.parse(userAgent.slice(0, 1024));
  const browserName = browser.name && browserNames.has(browser.name) ? browser.name : null;
  if (!browserName && !os.name) return null;
  return {
    browser_name: browserName,
    browser_version:
      browserName && browser.version && /^\d+(?:\.\d+)*$/.test(browser.version)
        ? browser.version.slice(0, 40)
        : null,
    os_name: os.name || null,
    device_type:
      platform.type === 'desktop' || platform.type === 'mobile' || platform.type === 'tablet'
        ? platform.type
        : 'unknown',
  };
}
