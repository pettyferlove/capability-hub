import {
  Activity,
  Archive,
  ArrowRightLeft,
  Ban,
  Boxes,
  Bug,
  CalendarDays,
  CheckCheck,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock3,
  FileCode2,
  FileDiff,
  Files,
  FolderGit2,
  Globe2,
  History,
  KeyRound,
  Layers3,
  Lightbulb,
  ListFilter,
  LockKeyhole,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Tag,
  TimerOff,
  Trash2,
  UserRound,
  Users,
  WandSparkles,
  Wrench,
} from '../icons/lucide.js';

// 显式按业务值选择图标，不根据可变的中文标签或未知值猜测。
export const configurationScopeIcons = { project: FolderGit2, user: UserRound };
export const intakeStatusIcons = {
  all: ListFilter,
  processing: Activity,
  ready: Send,
  pending: Clock3,
  approved: CheckCheck,
  failed: CircleX,
  rejected: RotateCcw,
  stale: TimerOff,
  cancelled: Archive,
  deprecated: CircleMinus,
  blocked: Ban,
};
export const classificationIcons = {
  uncategorized: CircleDashed,
  scenario: Boxes,
  general: Globe2,
};
export const audienceIcons = { public: Globe2, organization: Users, restricted: LockKeyhole };
export const credentialKindIcons = { token: KeyRound, ssh: SquareTerminal };
export const credentialMethodIcons = { basic: UserRound, bearer: KeyRound };
export const sourceStateIcons = { active: Play, paused: Pause };
export const resourceKindIcons = { skill: FileCode2, mcp: Settings2 };
export const fileFilterIcons = { changed: FileDiff, all: Files };
export const feedbackKindIcons = { defect: Bug, capability_gap: Boxes, suggestion: Lightbulb };
export const feedbackStatusIcons = {
  '': ListFilter,
  pending: Clock3,
  in_progress: Wrench,
  resolved: CircleCheck,
  declined: CircleMinus,
};
export const managementIcons = {
  delete: Trash2,
  deprecated: CircleMinus,
  blocked: Ban,
  active: CircleCheck,
  revoke: Archive,
  migrate: ArrowRightLeft,
  rollback: History,
};
export const auditCategoryIcons = {
  all: ListFilter,
  identity: ShieldCheck,
  publication: Send,
  content: Files,
  source: FolderGit2,
  operations: Activity,
  other: Layers3,
};
export const auditResultIcons = { all: ListFilter, success: CircleCheck, failure: CircleX };
export const timeRangeIcons = {
  all: CalendarDays,
  today: Clock3,
  '7d': CalendarDays,
  '30d': CalendarDays,
};
export const permissionScopeIcons = {
  platform: Globe2,
  team: Users,
  source: FolderGit2,
  asset: FileCode2,
  scenario: Boxes,
};
export const versionPlanIcons = {
  auto: WandSparkles,
  patch: Wrench,
  minor: Sparkles,
  major: Layers3,
  manual: Tag,
};
