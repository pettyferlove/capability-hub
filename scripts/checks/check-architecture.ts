import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBuiltin } from 'node:module';
import ts from 'typescript';
interface WorkspaceManifest {
  name: string;
  exports?: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
interface WorkspacePackage {
  directory: string;
  manifest: WorkspaceManifest;
  compilerOptions: ts.CompilerOptions;
}
export function checkArchitecture(root: string) {
  const packages: WorkspacePackage[] = ['apps', 'packages'].flatMap((directory) =>
    readdirSync(resolve(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const absolute = resolve(root, directory, entry.name);
        return {
          directory: absolute,
          compilerOptions: compilerOptions(absolute),
          manifest: JSON.parse(
            readFileSync(resolve(absolute, 'package.json'), 'utf8'),
          ) as WorkspaceManifest,
        };
      }),
  );
  const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
  const failures: string[] = [];
  let fileCount = 0;
  const runtimeImports = new Map<string, string[]>();
  const permittedDependencies: Record<string, string[]> = {
    '@capability-hub/ai': [],
    '@capability-hub/hub-agents': [
      '@capability-hub/ai',
      '@capability-hub/application',
      '@capability-hub/domain',
    ],
    '@capability-hub/logging': [],
    '@capability-hub/contracts': [],
    '@capability-hub/domain': [],
    '@capability-hub/application': ['@capability-hub/domain'],
    '@capability-hub/infrastructure': [
      '@capability-hub/ai',
      '@capability-hub/contracts',
      '@capability-hub/domain',
      '@capability-hub/application',
    ],
    '@capability-hub/server': [
      '@capability-hub/ai',
      '@capability-hub/hub-agents',
      '@capability-hub/application',
      '@capability-hub/logging',
      '@capability-hub/contracts',
      '@capability-hub/domain',
      '@capability-hub/infrastructure',
    ],
    '@capability-hub/cli': [
      '@capability-hub/contracts',
      '@capability-hub/domain',
      '@capability-hub/infrastructure',
    ],
    '@capability-hub/web': ['@capability-hub/contracts', '@capability-hub/logging'],
  };
  function sourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (['node_modules', 'dist'].includes(entry.name)) return [];
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : /\.[cm]?[jt]sx?$/.test(path) ? [path] : [];
    });
  }
  function dependencyName(specifier: string): string {
    return specifier.startsWith('@')
      ? specifier.split('/').slice(0, 2).join('/')
      : specifier.split('/')[0];
  }
  function checkSpecifier(pkg: WorkspacePackage, file: string, specifier: string): void {
    const report = (message: string) => failures.push(`${relative(root, file)}: ${message}`);
    const browserSource =
      ['@capability-hub/web', '@capability-hub/contracts'].includes(pkg.manifest.name) ||
      (pkg.manifest.name === '@capability-hub/logging' &&
        ['src/browser.ts', 'src/events.ts'].includes(relative(pkg.directory, file)));
    if (isBuiltin(specifier)) {
      if (browserSource) report(`浏览器入口不能引用 Node 内置模块 ${specifier}`);
      return;
    }
    if (browserSource && specifier === '@capability-hub/logging/server')
      report('浏览器入口不能引用服务端日志入口');
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(file), specifier);
      if (
        browserSource &&
        pkg.manifest.name === '@capability-hub/logging' &&
        target === resolve(pkg.directory, 'src/server.js')
      )
        report('浏览器入口不能引用服务端日志实现');
      if (
        pkg.manifest.name === '@capability-hub/web' &&
        relative(pkg.directory, file).startsWith('src/shared/') &&
        relative(pkg.directory, target).startsWith('src/features/')
      )
        report('shared 不能依赖业务功能模块');
      if (
        relative(pkg.directory, target) === '..' ||
        relative(pkg.directory, target).startsWith('../')
      )
        report(`跨包相对引用 ${specifier}；请使用声明过的 workspace 包导出`);
      return;
    }
    const name = dependencyName(specifier);
    const declared = { ...pkg.manifest.dependencies, ...pkg.manifest.devDependencies };
    if (name === pkg.manifest.name) {
      const subpath = specifier === name ? '.' : '.' + specifier.slice(name.length);
      if (!Object.hasOwn(pkg.manifest.exports ?? {}, subpath))
        report(`非公开的包内自引用 ${specifier}`);
      return;
    }
    if (!(name in declared)) report(`未声明依赖 ${name}`);
    const dependency = byName.get(name);
    if (!dependency) return;
    if (declared[name] !== 'workspace:*')
      report(`${name} 必须使用 workspace:*，避免安装同名远程包`);
    if (!permittedDependencies[pkg.manifest.name]?.includes(name))
      report(`不允许 ${pkg.manifest.name} 依赖 ${name}`);
    const subpath = specifier === name ? '.' : '.' + specifier.slice(name.length);
    const exported = Object.keys(dependency.manifest.exports ?? {}).some(
      (key) => key === subpath || (key.endsWith('*') && subpath.startsWith(key.slice(0, -1))),
    );
    if (!exported) report(`${specifier} 不是该包的公共导出`);
  }
  for (const pkg of packages) {
    for (const [name, version] of Object.entries({
      ...pkg.manifest.dependencies,
      ...pkg.manifest.devDependencies,
    })) {
      if (byName.has(name)) {
        if (version !== 'workspace:*')
          failures.push(`${pkg.manifest.name}: ${name} 必须使用 workspace:*`);
        if (!permittedDependencies[pkg.manifest.name]?.includes(name))
          failures.push(`${pkg.manifest.name}: 层次依赖无效 ${name}`);
      }
    }
    for (const entry of Object.values(pkg.manifest.exports ?? {})) {
      for (const target of typeof entry === 'string' ? [entry] : Object.values(entry)) {
        const source = target.replace('./dist/', './src/').replace(/\.d\.ts$|\.js$/, '.ts');
        if (!target.includes('*') && !existsSync(resolve(pkg.directory, source)))
          failures.push(`${pkg.manifest.name}: 导出对应源码不存在 ${target}`);
      }
    }
    for (const file of sourceFiles(pkg.directory)) {
      fileCount++;
      const filename = file.split('/').at(-1)!;
      if (
        !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.d)?\.(?:[cm]?ts|mjs)$/.test(filename) &&
        !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(filename) &&
        !['main.tsx', 'vite.config.ts'].includes(filename)
      )
        failures.push(`${relative(root, file)}: 文件名应为 kebab-case.ts 或 PascalCase.tsx`);
      runtimeImports.set(file, []);
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      let sawBody = false;
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement)) {
          if (sawBody) failures.push(`${relative(root, file)}: import 声明必须位于模块正文之前`);
        } else sawBody = true;
      }
      function visit(node: ts.Node): void {
        if (
          (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          const specifier = node.moduleSpecifier.text;
          checkSpecifier(pkg, file, specifier);
          const typeOnly = ts.isImportDeclaration(node)
            ? node.importClause?.isTypeOnly
            : node.isTypeOnly;
          const named = ts.isImportDeclaration(node)
            ? node.importClause?.namedBindings
            : node.exportClause;
          const onlyTypeBindings =
            named &&
            (ts.isNamedImports(named) || ts.isNamedExports(named)) &&
            !(ts.isImportDeclaration(node) && node.importClause?.name) &&
            named.elements.length > 0 &&
            named.elements.every((element) => element.isTypeOnly);
          if (specifier.startsWith('.') && !typeOnly && !onlyTypeBindings) {
            const resolved = ts.resolveModuleName(specifier, file, pkg.compilerOptions, ts.sys)
              .resolvedModule?.resolvedFileName;
            if (resolved && !resolved.endsWith('.d.ts')) runtimeImports.get(file)!.push(resolved);
          }
        }
        if (
          ts.isImportTypeNode(node) &&
          ts.isLiteralTypeNode(node.argument) &&
          ts.isStringLiteral(node.argument.literal)
        )
          checkSpecifier(pkg, file, node.argument.literal.text);
        if (
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            node.expression.getText(source) === 'import.meta.resolve' ||
            node.expression.getText(source) === 'require') &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        )
          checkSpecifier(pkg, file, node.arguments[0].text);
        if (
          ts.isImportEqualsDeclaration(node) &&
          ts.isExternalModuleReference(node.moduleReference) &&
          node.moduleReference.expression &&
          ts.isStringLiteralLike(node.moduleReference.expression)
        )
          checkSpecifier(pkg, file, node.moduleReference.expression.text);
        if (node.kind === ts.SyntaxKind.AnyKeyword)
          failures.push(
            `${relative(root, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: 使用具体类型或先收窄 unknown，禁止显式 any`,
          );
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  // 包依赖必须无环，避免构建顺序和职责相互依赖。
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function checkCycle(name: string, chain: string[] = []): void {
    if (visiting.has(name)) {
      failures.push(`循环依赖: ${[...chain, name].join(' → ')}`);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dependency of Object.keys(byName.get(name)?.manifest.dependencies ?? {}))
      if (byName.has(dependency)) checkCycle(dependency, [...chain, name]);
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of byName.keys()) checkCycle(name);

  const activeFiles = new Set<string>();
  const checkedFiles = new Set<string>();
  function checkFileCycle(file: string, chain: string[] = []): void {
    if (activeFiles.has(file)) {
      failures.push(
        `源码运行时循环: ${[...chain.slice(chain.indexOf(file)), file].map((path) => relative(root, path)).join(' → ')}`,
      );
      return;
    }
    if (checkedFiles.has(file)) return;
    activeFiles.add(file);
    for (const dependency of runtimeImports.get(file) ?? [])
      checkFileCycle(dependency, [...chain, file]);
    activeFiles.delete(file);
    checkedFiles.add(file);
  }
  for (const file of runtimeImports.keys()) checkFileCycle(file);

  return { failures: [...new Set(failures)], packages: packages.length, files: fileCount };
}

function compilerOptions(directory: string): ts.CompilerOptions {
  const config = ts.findConfigFile(directory, (path) => ts.sys.fileExists(path));
  if (!config) return { moduleResolution: ts.ModuleResolutionKind.Bundler };
  const read = ts.readConfigFile(config, (path) => ts.sys.readFile(path));
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  return ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(config)).options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkArchitecture(resolve(import.meta.dirname, '../..'));
  if (result.failures.length) {
    process.stderr.write(result.failures.join('\n') + '\n');
    process.exitCode = 1;
  } else
    process.stdout.write(
      `架构检查通过：${result.packages} 个工作区项目、${result.files} 个源文件；依赖方向、公共导出与显式 any 均符合约束。\n`,
    );
}
