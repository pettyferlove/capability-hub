import type { Finding } from '@capability-hub/domain/content';

/**
 * 静态检出结果的最小形态：只带行号与不敏感摘要，**不含命中的原文**，
 * 因此可以安全地写入数据库或展示给审核者，不需要额外的脱敏层。
 */
export type TextFinding = Pick<Finding, 'rule_id' | 'line' | 'evidence_summary'> & {
  severity: 'warning';
};

// 格式规则集中维护；不联网验证凭据，也不按测试目录或示例字符串豁免。
const credentialPatterns = [
  /\bgh[pousr]_[A-Za-z0-9]{36}(?![A-Za-z0-9_])/,
  /\bgithub_pat_[A-Za-z0-9_]{82}(?![A-Za-z0-9_])/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}(?![A-Z0-9])/,
  /\bsk-(?:(?:proj|svcacct|admin)-(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})T3BlbkFJ(?:[A-Za-z0-9_-]{74}|[A-Za-z0-9_-]{58})|[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20})(?![A-Za-z0-9_-])/,
];

/**
 * 判断字段名是否属于「敏感字段」。先做 camelCase → snake_case 拆分再小写，
 * 因此 `apiKey`、`API_KEY`、`AWSAccessKey` 归一到同一形态；仅匹配字段名的尾部，
 * 避免 `tokenizer`、`password_policy` 之类的复合词被误判为承载凭据的字段。
 */
export function secretField(name: string): boolean {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return /(?:^|[_-])(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)$/.test(
    words,
  );
}

/** 只识别完整的变量引用语法，不以 example/test 等普通前缀掩盖后续真实值。 */
export function variableReference(value: string): boolean {
  return /^(?:\$[A-Za-z_][\w]*|\$\{[A-Za-z_][\w.]*\}|\{[A-Za-z_][\w.]*\}|\{\{\s*[\w.]+\s*\}\}|<[A-Za-z_][\w.-]*>)$/.test(
    value,
  );
}

/**
 * 逐行静态扫描凭据痕迹，惰性产出以配合调用方的条数上限（`inspect` 达 1000 条即停止迭代）。
 *
 * 三个规则层次：已知凭据格式（含校验形状但不联网）、敏感字段名 + 长度 ≥ 20 的固定字面量、
 * PEM 私钥标记。字段值形如完整变量引用或读环境变量的表达式时跳过，因为那类写法本身不泄露内容。
 * 只在单行内判断，跨行拼接的凭据与编码隐藏不做分析——未命中不代表安全。
 */
export function* secretFindings(text: string): Generator<TextFinding> {
  const lines = text.split(/\r\n?|\n/);
  for (const [index, line] of lines.entries()) {
    if (credentialPatterns.some((pattern) => pattern.test(line))) {
      yield {
        rule_id: 'SECRET',
        severity: 'warning',
        line: index + 1,
        evidence_summary:
          '匹配已知凭据格式，原文已隐藏；请核对用途，若为真实凭据请移除并撤销或轮换；确认可分发时需记录理由。',
      };
      continue;
    }
    // 提取完整字段名和字符串字面量，覆盖 JSON、YAML、环境变量与常见源码赋值。
    const assignments = line.matchAll(
      /(?:^|[^\w$])(?:["']([A-Za-z_][\w-]*)["']|([A-Za-z_][\w-]*))\s*[:=]\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s,;<>"'{}[\]]+))/g,
    );
    for (const match of assignments) {
      if (!secretField(match[1] ?? match[2])) continue;
      const value = match[3] ?? match[4] ?? match[5];
      if (value.length < 20 || variableReference(value)) continue;
      if (match[5] && /^(?:process\.env\.|import\.meta\.env\.|os\.environ\[)/.test(value)) continue;
      yield {
        rule_id: 'SECRET_CANDIDATE',
        severity: 'warning',
        line: index + 1,
        evidence_summary:
          '敏感字段包含较长的固定值，原文已隐藏；静态检查无法确认是否为凭据，请审核用途。真实凭据需移除并轮换，模拟值需记录接受理由。',
      };
      break;
    }
  }
  for (const [index, line] of lines.entries()) {
    if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(line))
      yield {
        rule_id: 'PRIVATE_KEY',
        severity: 'warning',
        line: index + 1,
        evidence_summary:
          '包含私钥标记，原文已隐藏；请核对是否为示例或真实私钥，确认可分发时需记录理由。',
      };
  }
}
