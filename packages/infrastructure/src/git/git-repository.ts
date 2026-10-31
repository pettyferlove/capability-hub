import type { GitSourceRecord } from '@capability-hub/domain/models';
import type { ContentFile } from '@capability-hub/domain/content';
import { fail, HubError } from '@capability-hub/domain/errors';
import { executableText } from '@capability-hub/domain/files';
import { safePath } from '@capability-hub/domain/paths';
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  GitCredentialResolver,
  GitRepository,
  GitDestination,
  GitSnapshot,
} from '@capability-hub/application/ports';
import { isRestrictedGitAddress } from './network-policy.js';
import { sshAskpass } from '../security/ssh-askpass.js';
export interface GitRepositoryOptions {
  dataDir: string;
  gitHosts: readonly string[];
  privateGitHosts: readonly string[];
}
const shellQuote = (v: string) => "'" + v.replaceAll("'", "'\\''") + "'";
export class GitRepositoryAdapter implements GitRepository {
  constructor(
    private readonly config: GitRepositoryOptions,
    private readonly credentials?: GitCredentialResolver,
    private readonly resolveHost: (host: string) => Promise<readonly { address: string }[]> = (
      host,
    ) => lookup(host, { all: true }),
  ) {}
  async validate(raw: string): Promise<GitDestination> {
    if (/[\p{Cc}\s]/u.test(raw)) fail(422, 'GIT_URL', '仓库地址不得包含空白或控制字符');
    const scp = /^[a-zA-Z0-9_.-]+@[^/:]+:/.test(raw) ? raw : undefined;
    if (scp && /[\p{Cc}\s\\]/u.test(scp)) fail(422, 'GIT_URL', 'SSH 仓库地址包含不支持的字符');
    if (scp) raw = 'ssh://' + raw.replace(':', '/');
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      fail(422, 'GIT_URL', '仓库 URL 无效');
    }
    if (
      !['https:', 'ssh:'].includes(u.protocol) ||
      (u.protocol === 'https:' && u.username) ||
      (u.protocol === 'ssh:' && !/^(?!-)[a-zA-Z0-9_.-]+$/.test(u.username || 'git')) ||
      u.password ||
      u.hash ||
      u.search ||
      (u.protocol === 'https:' && u.port && u.port !== '443')
    )
      fail(422, 'GIT_URL', '请使用 HTTPS 或 SSH 仓库地址，不得在 URL 中携带 Token 或密码');
    if (!this.config.gitHosts.includes(u.hostname))
      fail(422, 'GIT_HOST_DENIED', 'Git 域名不在管理员允许列表');
    if (!u.pathname || u.pathname === '/') fail(422, 'GIT_URL', '请提供具体仓库路径');
    const hostname = u.hostname.replace(/^\[|\]$/g, '');
    let records: readonly { address: string }[];
    try {
      records = isIP(hostname) ? [{ address: hostname }] : await this.resolveHost(hostname);
    } catch {
      fail(422, 'GIT_DNS_FAILED', '无法解析 Git 主机地址');
    }
    if (
      !records.length ||
      records.some((record) => !isIP(record.address)) ||
      (!this.config.privateGitHosts.includes(u.hostname) &&
        records.some((r) => isRestrictedGitAddress(r.address)))
    )
      fail(422, 'GIT_ADDRESS_DENIED', 'Git 地址解析到被禁止的网络');
    u.pathname = u.pathname.replace(/\/+$/, '');
    return {
      url: scp
        ? u.username + '@' + u.hostname + ':' + scp.slice(scp.indexOf(':') + 1).replace(/\/+$/, '')
        : u.toString(),
      identity:
        u.hostname +
        (u.port && Number(u.port) !== (u.protocol === 'ssh:' ? 22 : 443) ? ':' + u.port : '') +
        u.pathname.replace(/\.git$/, ''),
      host: u.hostname,
      address: records[0].address,
      transport: u.protocol === 'ssh:' ? 'ssh' : 'https',
      port: Number(u.port || (u.protocol === 'ssh:' ? 22 : 443)),
      username: u.username || 'git',
    };
  }
  private async runGit(args: string[], cwd: string, extraEnv: Record<string, string> = {}) {
    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn('/usr/bin/git', args, {
        cwd,
        env: {
          PATH: process.env.PATH ?? '/usr/bin:/bin',
          HOME: cwd,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
          GIT_PROTOCOL_FROM_USER: '0',
          GIT_ALLOW_PROTOCOL: 'https:ssh',
          GIT_LFS_SKIP_SMUDGE: '1',
          LC_ALL: 'C.UTF-8',
          ...extraEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let size = 0;
      const chunks: Buffer[] = [];
      const errors: Buffer[] = [];
      let failure: HubError | undefined;
      const terminate = (error: HubError) => {
        if (failure) return;
        failure = error;
        child.kill('SIGKILL');
      };
      const timer = setTimeout(() => {
        terminate(new HubError(504, 'GIT_TIMEOUT', 'Git 拉取超时', {}, true));
      }, 45000);
      child.stdout.on('data', (c: Buffer) => {
        if (failure) return;
        size += c.length;
        if (size > 110 * 1024 * 1024) {
          terminate(new HubError(413, 'GIT_SIZE', 'Git 返回数据超过限制'));
        } else chunks.push(c);
      });
      child.stderr.on('data', (c: Buffer) => {
        const remaining = 4096 - errors.reduce((n, b) => n + b.length, 0);
        if (remaining > 0) errors.push(c.subarray(0, remaining));
      });
      child.on('error', () => {
        clearTimeout(timer);
        failure ??= new HubError(502, 'GIT_UNAVAILABLE', '无法启动受控 Git 客户端');
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (failure) reject(failure);
        else if (code === 0) resolve(Buffer.concat(chunks));
        else {
          const text = Buffer.concat(errors).toString();
          reject(
            new HubError(
              502,
              /401|403|Authentication|could not read Username|Permission denied|Host key verification failed/i.test(
                text,
              )
                ? 'GIT_AUTH_ERROR'
                : 'GIT_FETCH_FAILED',
              /401|403|Authentication|could not read Username|Permission denied|Host key verification failed/i.test(
                text,
              )
                ? '来源认证失败，请更新凭据引用'
                : 'Git 操作失败，请确认仓库和分支',
              {},
              !/401|403|Authentication|Permission denied|Host key verification failed/i.test(text),
            ),
          );
        }
      });
    });
  }
  async branch(branch: string) {
    if (branch.startsWith('-') || branch.length > 255 || /[\p{Cc}\s]/u.test(branch))
      fail(422, 'GIT_BRANCH', '分支名无效');
    try {
      await this.runGit(['check-ref-format', '--branch', branch], this.config.dataDir);
    } catch {
      fail(422, 'GIT_BRANCH', '分支名不符合 Git ref 规则');
    }
  }
  async snapshot(
    source: Pick<GitSourceRecord, 'canonical_url' | 'branch'> &
      Partial<Pick<GitSourceRecord, 'credential_ref'>>,
  ): Promise<GitSnapshot> {
    const destination = await this.validate(source.canonical_url);
    await this.branch(source.branch);
    const dir = await mkdtemp(join(tmpdir(), 'capability-hub-git-'));
    const env: Record<string, string> = {};
    let personalRevision: number | undefined;
    try {
      if (source.credential_ref) {
        if (!this.credentials) fail(422, 'CREDENTIAL_UNAVAILABLE', '个人 Git 凭据服务不可用');
        const c = await this.credentials.resolve(
          source.credential_ref,
          destination.host,
          destination.transport,
        );
        personalRevision = c.revision;
        if (c.kind === 'token') {
          if (c.auth_method === 'bearer') {
            env.GIT_CONFIG_COUNT = '1';
            env.GIT_CONFIG_KEY_0 = `http.https://${destination.host}/.extraHeader`;
            env.GIT_CONFIG_VALUE_0 = 'Authorization: Bearer ' + c.secret;
          } else {
            const askpass = join(dir, 'git-askpass');
            await writeFile(
              askpass,
              '#!/bin/sh\ncase "$1" in *sername*) printf "%s\\n" "$CAPABILITY_GIT_USERNAME" ;; *) printf "%s\\n" "$CAPABILITY_GIT_TOKEN" ;; esac\n',
              { mode: 0o700 },
            );
            env.GIT_ASKPASS = askpass;
            env.CAPABILITY_GIT_USERNAME = c.username;
            env.CAPABILITY_GIT_TOKEN = c.secret;
          }
        } else {
          const key = join(dir, 'identity'),
            known = join(dir, 'known-hosts'),
            askpass = join(dir, 'ssh-askpass'),
            pass = join(dir, 'passphrase');
          const alias =
            destination.port === 22
              ? destination.host
              : `[${destination.host}]:${destination.port}`;
          await writeFile(key, c.secret.endsWith('\n') ? c.secret : c.secret + '\n', {
            mode: 0o600,
          });
          await writeFile(known, alias + ' ' + c.host_key + '\n', { mode: 0o600 });
          await writeFile(pass, c.passphrase, { mode: 0o600 });
          await writeFile(askpass, sshAskpass, { mode: 0o700 });
          env.SSH_ASKPASS = askpass;
          env.SSH_ASKPASS_REQUIRE = 'force';
          env.DISPLAY = 'capability-hub';
          env.CAPABILITY_SSH_PASSPHRASE_FILE = pass;
          env.GIT_SSH_VARIANT = 'ssh';
          env.GIT_SSH_COMMAND = [
            '/usr/bin/ssh',
            '-F',
            '/dev/null',
            '-i',
            key,
            '-o',
            'IdentitiesOnly=yes',
            '-o',
            'IdentityAgent=none',
            '-o',
            'StrictHostKeyChecking=yes',
            '-o',
            `UserKnownHostsFile=${known}`,
            '-o',
            'GlobalKnownHostsFile=/dev/null',
            '-o',
            `HostKeyAlias=${alias}`,
            '-o',
            `Hostname=${destination.address}`,
            '-o',
            'ProxyCommand=none',
            '-o',
            'ProxyJump=none',
            '-o',
            'PasswordAuthentication=no',
            '-o',
            'KbdInteractiveAuthentication=no',
            '-o',
            'NumberOfPasswordPrompts=1',
            '-o',
            'ConnectTimeout=15',
          ]
            .map(shellQuote)
            .join(' ');
          if (/^[a-zA-Z0-9_.-]+@[^/:]+:/.test(destination.url))
            destination.url = c.username + destination.url.slice(destination.url.indexOf('@'));
          else {
            const u = new URL(destination.url);
            u.username = c.username;
            destination.url = u.toString();
          }
        }
      }
      if (destination.transport === 'ssh' && !source.credential_ref)
        fail(422, 'SSH_CREDENTIAL_REQUIRED', 'SSH 仓库需要在个人中心维护并选择 SSH 私钥与主机公钥');
      const base = [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'protocol.allow=never',
        '-c',
        `protocol.${destination.transport}.allow=always`,
        '-c',
        'http.followRedirects=false',
        '-c',
        `http.curloptResolve=${destination.host}:443:${isIP(destination.address) === 6 ? '[' + destination.address + ']' : destination.address}`,
        '-c',
        'credential.helper=',
        '-c',
        'core.attributesFile=/dev/null',
      ];
      await this.runGit(['init', '--bare', dir], dir);
      await this.runGit(
        [
          ...base,
          'fetch',
          '--no-tags',
          '--depth=1',
          destination.url,
          `refs/heads/${source.branch}`,
        ],
        dir,
        env,
      );
      const commit = (await this.runGit(['rev-parse', 'FETCH_HEAD'], dir)).toString().trim();
      if (
        personalRevision !== undefined &&
        (await this.credentials!.currentRevision(source.credential_ref!)) !== personalRevision
      )
        fail(409, 'CREDENTIAL_CHANGED', 'Git 凭据在同步期间发生变化，请重新同步');
      if (!/^[a-f0-9]{40,64}$/.test(commit)) fail(502, 'GIT_COMMIT', 'Git 提交无效');
      return {
        commit,
        ...(personalRevision !== undefined ? { credential_revision: personalRevision } : {}),
        read: async (path: string, kind: string) => {
          const records = await this.runGit(
            ['ls-tree', '-rz', '--full-tree', commit, '--', path === '.' ? '.' : path],
            dir,
          );
          let decoded: string;
          try {
            decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(records);
          } catch {
            fail(422, 'GIT_PATH_ENCODING', 'Git 文件路径必须采用有效 UTF-8 编码');
          }
          const entries = decoded.split('\0').filter(Boolean);
          const files: ContentFile[] = [];
          let total = 0;
          for (const entry of entries) {
            const m = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/);
            if (!m) fail(422, 'GIT_TREE', '无法解析提交树');
            const [, mode, type, oid, name] = m;
            if (!['100644', '100755'].includes(mode) || type !== 'blob')
              fail(422, 'GIT_ENTRY_TYPE', '读取目标包含链接、子模块或特殊文件');
            if (kind === 'mcp' && name !== path) continue;
            const relative =
              kind === 'mcp' ? 'server.json' : path === '.' ? name : name.slice(path.length + 1);
            safePath(relative);
            if (files.length >= 500) fail(413, 'PACKAGE_LIMIT', '目标超过 500 个文件');
            const size = Number((await this.runGit(['cat-file', '-s', oid], dir)).toString());
            total += size;
            if (size > 10 * 1024 * 1024 || total > 100 * 1024 * 1024)
              fail(413, 'PACKAGE_LIMIT', '目标内容超过限制');
            const bytes = await this.runGit(['cat-file', 'blob', oid], dir);
            files.push({
              path: relative,
              bytes,
              executable: executableText(relative, bytes),
            });
          }
          if (!files.length) fail(422, 'TARGET_MISSING', '固定提交中未找到读取目标');
          return files;
        },
        close: () => rm(dir, { recursive: true, force: true }),
      };
    } catch (e) {
      await rm(dir, { recursive: true, force: true });
      throw e;
    }
  }
}
