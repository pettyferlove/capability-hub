import postcss from 'postcss';
import ts from 'typescript';

const literalColor =
  /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\b(?:rgba?|hsla?|oklch|oklab|hwb|lab|lch|color)\(|\b(?:bg|text|border|fill|stroke|outline|ring|shadow)-(?:white|black|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3})\b/i;

/**
 * 找出硬编码颜色的行：CSS 声明，以及 TS/TSX 中出现在 className/style/cn 等样式上下文里的字面量。
 * 守卫的是主题可切换这一约定——写死 `#fff` 或 `text-red-500` 会在另一个配色下失去对比度，
 * 且无从用变量修正。返回行号（从 1 开始）而不是抛出，方便一次性报出全部位置。
 */
export function fixedColorLines(filename: string, text: string): number[] {
  const lines = new Set<number>();
  if (filename.endsWith('.css')) {
    postcss.parse(text, { from: filename }).walkDecls((declaration) => {
      if (declaration.prop === 'content') return;
      const value = declaration.value
        .replace(/url\([^)]*\)/gi, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      if (literalColor.test(value)) lines.add(declaration.source?.start?.line ?? 1);
    });
  } else {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    const styleFile = /(?:^|\/)styles(?:\/|\.ts$)/.test(filename);
    function styleContext(node: ts.Node): boolean {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxAttribute(parent))
          return ['className', 'style'].includes(parent.name.getText(source));
        if (
          ts.isPropertyAssignment(parent) &&
          /^(?:className|style|color|background(?:Color)?|border(?:Color)?|fill|stroke|boxShadow)$/.test(
            parent.name.getText(source),
          )
        )
          return true;
        if (
          ts.isCallExpression(parent) &&
          /^(?:cn|clsx|classnames|cva|tv)$/.test(parent.expression.getText(source))
        )
          return true;
        if (ts.isVariableDeclaration(parent))
          return /(?:style|class)/i.test(parent.name.getText(source));
      }
      return false;
    }
    function visit(node: ts.Node): void {
      if (
        (ts.isStringLiteralLike(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node)) &&
        (styleFile || styleContext(node)) &&
        literalColor.test(node.text)
      )
        lines.add(source.getLineAndCharacterOfPosition(node.getStart()).line + 1);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...lines];
}

/**
 * 解析主题 CSS 里的调色板：按带 `color-scheme: light|dark` 的规则分组，
 * 收集其中的 `--*` 十六进制变量，
 * 并把三位写法展开成六位以便逐项对比。没有 `data-palette` 的规则按默认 `graphite` 记名。
 * 供比对每套调色板在两套模式下是否定义了同一批变量，这类差异人工核对容易漏。
 */
export function readThemePalettes(text: string) {
  const palettes: { name: string; mode: string; colors: Map<string, string> }[] = [];
  postcss.parse(text).walkRules((rule) => {
    const declarations = new Map<string, string>();
    rule.each((node) => {
      if (node.type === 'decl') declarations.set(node.prop, node.value);
    });
    const mode = declarations.get('color-scheme');
    if (mode !== 'light' && mode !== 'dark') return;
    const colors = new Map<string, string>();
    for (const [property, value] of declarations) {
      if (!property.startsWith('--') || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value)) continue;
      colors.set(
        property.slice(2),
        value.length === 4 ? '#' + [...value.slice(1)].map((c) => c + c).join('') : value,
      );
    }
    palettes.push({
      name: rule.selector.match(/data-palette\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? 'graphite',
      mode,
      colors,
    });
  });
  return palettes;
}

/**
 * 找出缺少分隔空行的位置：import 块之后、模块级代码块之后、模块级 `/** *\/` 文档块之前。
 * 守卫的是「代码粘连」这一可读性约定——Prettier 只保留已有空行而不会补，
 * 因此压缩成一整块的文件能通过 `format:check`。类与接口成员之间刻意不加空行，不在此列。
 * 返回行号（从 1 开始）而不是抛出，方便一次性报出全部位置。
 */
export function blankLineViolations(filename: string, text: string): number[] {
  const source = ts.createSourceFile(
    filename,
    text,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = text.split('\n');
  const blank = (index: number) => lines[index] !== undefined && lines[index].trim() === '';
  const violations = new Set<number>();
  const statements = source.statements;
  const lastImport = statements.findLastIndex((statement) => ts.isImportDeclaration(statement));
  const blockEnding = (node: ts.Statement) =>
    ts.isFunctionDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isBlock(node) ||
    ts.isIfStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node);
  statements.forEach((statement, index) => {
    const doc = ts.getJSDocCommentsAndTags(statement).find(ts.isJSDoc);
    if (doc) {
      const start = source.getLineAndCharacterOfPosition(doc.pos).line;
      if (start > 0 && !blank(start - 1)) violations.add(start);
    }
    if (index === statements.length - 1) return;
    if (index !== lastImport && !blockEnding(statement)) return;
    const end = source.getLineAndCharacterOfPosition(statement.end).line;
    if (!blank(end + 1)) violations.add(end + 1);
  });
  return [...violations].sort((left, right) => left - right);
}
