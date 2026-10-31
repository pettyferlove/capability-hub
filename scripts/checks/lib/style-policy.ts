import postcss from 'postcss';
import ts from 'typescript';

const literalColor =
  /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\b(?:rgba?|hsla?|oklch|oklab|hwb|lab|lch|color)\(|\b(?:bg|text|border|fill|stroke|outline|ring|shadow)-(?:white|black|(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3})\b/i;

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
