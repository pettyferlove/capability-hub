export function shortVersion(v: string) {
  return v.startsWith('git.') ? v.slice(0, 12) + '…' : v;
}
