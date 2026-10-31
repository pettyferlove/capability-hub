import user from '@iconify-icons/lucide/user-round';
import users from '@iconify-icons/lucide/users';
import mail from '@iconify-icons/lucide/mail';
import briefcase from '@iconify-icons/lucide/briefcase-business';
import packageIcon from '@iconify-icons/lucide/package';
import tag from '@iconify-icons/lucide/tag';
import link from '@iconify-icons/lucide/link';
import branch from '@iconify-icons/lucide/git-branch';
import folder from '@iconify-icons/lucide/folder';
import terminal from '@iconify-icons/lucide/terminal';
import variable from '@iconify-icons/lucide/variable';
import key from '@iconify-icons/lucide/key-round';
import lock from '@iconify-icons/lucide/lock-keyhole';
import text from '@iconify-icons/lucide/file-text';

// 单图标静态导入，随应用交付；字段语义由调用方明确指定。
export const inputIcons = {
  user,
  users,
  mail,
  briefcase,
  package: packageIcon,
  tag,
  link,
  branch,
  folder,
  terminal,
  variable,
  key,
  lock,
  text,
} as const;
export type InputIconName = keyof typeof inputIcons;
