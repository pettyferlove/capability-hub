import { get } from 'node:http';
// 连接本机监听端口，同时携带服务允许的公开 Host。
const host = new URL(process.env.CAPABILITY_HUB_PUBLIC_URL).host;
const request = get(
  {
    hostname: '127.0.0.1',
    port: Number(process.env.PORT ?? 4100),
    path: '/health/ready',
    headers: { Host: host },
  },
  (response) => {
    response.resume();
    response.once('end', () => process.exit(response.statusCode === 200 ? 0 : 1));
  },
);
request.setTimeout(4000, () => request.destroy(new Error('Readiness timed out')));
request.once('error', () => process.exit(1));
