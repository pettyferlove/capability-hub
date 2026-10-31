import { crc32 } from 'node:zlib';

/** 单条目、无压缩 ZIP 协议夹具，允许构造生产写入器不会生成的错误元数据。 */
export function storedZip(
  options: {
    name?: Buffer;
    content?: Buffer;
    crc?: number;
    mode?: number;
    size?: number;
    flags?: number;
  } = {},
): Buffer {
  const name = options.name ?? Buffer.from('file.txt');
  const content = options.content ?? Buffer.from('payload');
  const checksum = options.crc ?? crc32(content);
  const size = options.size ?? content.length;
  const flags = options.flags ?? 0x800;
  const body = flags & 1 ? Buffer.concat([Buffer.alloc(12), content]) : content;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(((options.mode ?? 0x81a4) << 16) >>> 0, 38);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + body.length, 16);
  return Buffer.concat([local, name, body, central, name, end]);
}
