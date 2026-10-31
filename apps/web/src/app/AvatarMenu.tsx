import {
  avatarMenuStyles,
  avatarMenuTriggerStyles,
  avatarMenuChevronStyles,
  avatarMenuPopoverStyles,
  avatarMenuIdentityStyles,
  avatarMenuItemsStyles,
} from './styles.js';
import { dangerTextStyles, noticeErrorStyles } from '../shared/styles/recipes.js';
import {
  ChevronDown,
  KeyRound,
  LogOut,
  Settings2,
  ShieldCheck,
  UserRound,
} from '../shared/icons/lucide.js';
import { useState } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover, Separator } from 'react-aria-components';
import { UserAvatar } from '../shared/components/UserAvatar.js';
import { useHub } from '../shared/context/HubContext.js';
export function AvatarMenu() {
  const { me, logout } = useHub();
  const [error, setError] = useState('');
  return (
    <div className={avatarMenuStyles}>
      <MenuTrigger>
        <Button className={avatarMenuTriggerStyles} aria-label="个人菜单">
          {me && <UserAvatar identity={me.id} color={me.avatar_color} />}
          <ChevronDown size={13} className={avatarMenuChevronStyles} />
        </Button>
        <Popover
          className={avatarMenuPopoverStyles}
          placement="bottom end"
          offset={10}
          data-overlay-child="true"
        >
          <div className={avatarMenuIdentityStyles}>
            {me && <UserAvatar identity={me.id} color={me.avatar_color} size={44} />}
            <span>
              <strong>{me?.display_name}</strong>
              <small>@{me?.username}</small>
            </span>
          </div>
          <Menu className={avatarMenuItemsStyles} aria-label="个人菜单操作">
            <MenuItem href="/account" textValue="个人资料">
              <UserRound size={16} />
              <span>个人资料</span>
            </MenuItem>
            <MenuItem href="/account?tab=credentials" textValue="Git 凭据">
              <KeyRound size={16} />
              <span>Git 凭据</span>
            </MenuItem>
            <MenuItem href="/account?tab=security" textValue="账号安全">
              <ShieldCheck size={16} />
              <span>账号安全</span>
            </MenuItem>
            {me?.capabilities.can_admin && (
              <MenuItem href="/account?tab=identity" textValue="团队与权限">
                <Settings2 size={16} />
                <span>团队与权限</span>
              </MenuItem>
            )}
            <Separator />
            <MenuItem
              className={dangerTextStyles}
              textValue="退出登录"
              onAction={() => {
                setError('');
                void logout().catch((error: unknown) =>
                  setError(error instanceof Error ? error.message : '退出登录失败'),
                );
              }}
            >
              <LogOut size={16} />
              <span>退出登录</span>
            </MenuItem>
          </Menu>
          {error && (
            <p className={noticeErrorStyles} role="alert">
              {error}
            </p>
          )}
        </Popover>
      </MenuTrigger>
    </div>
  );
}
