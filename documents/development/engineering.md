# 工程规范

## 环境与命令

Node 24.22.1、pnpm 10.33.0，版本分别由 .nvmrc、engines 和 packageManager 固定。使用锁文件安装；公共依赖版本集中在 pnpm-workspace.yaml catalog，包间为 workspace:*。

`pnpm check` 依次执行架构、文档链接、typed ESLint、Prettier/SQL 格式、类型、编译构建和默认测试。`pnpm build` 编译 Node packages/apps、Web 及运维脚本；生产入口在 dist，开发显式使用 development 条件及 tsx。

## 命名与组织

- TS 文件 kebab-case，React 组件 PascalCase；main.tsx 和工具配置遵循工具入口惯例。
- HTTP 输入为 Request/Query 与对应 Schema，输出为 Response，内部记录为 Record；用例类型命名为 Command/Query。
- DTO 是可采用的架构术语，TypeScript 不规定统一后缀。本项目按边界语义命名，不把所有结构统称 DTO。
- 每个模块拥有明确用例和状态，不为对称目录创建空包；只将真实复用的能力放入 shared。
- 类描述状态与协作职责；纯转换保持函数。不要以同构接口或无逻辑转发层增加抽象。

## 类型与边界

外部 JSON、请求、数据库记录、CLI 响应和存储快照从 unknown 开始校验。禁止显式 any，窄化后再访问。包间只能使用 exports；禁止跨包相对路径及内部源码深导入。

contracts 不能包含 Node 运行依赖、密码哈希、内部会话秘密、凭据密文或 blob_ref；认证输入和显式 CSRF 响应属于其协议职责。应用输出显式映射，不对敏感 Record 做盲目展开。HTTP/MCP 负责传输校验，领域规则和原子写入留在用例。

architecture 检查包依赖、公共导出对应源码、源码运行时循环、Web shared 边界、import 位置与文件命名；浏览器入口禁止 Node 内置模块和服务端日志入口。ESLint 检查异步使用、未收窄输入等类型问题。新增导出应同时考虑 development、types、default 及 Docker 运行资产。

## 前端选择控件

系统功能图标统一从 `shared/icons/lucide.ts` 引入，品牌图标从 `client-icons.ts` 映射获取，底层仅通过 `shared/icons/AppIcon.tsx` 的 `AppIcon` 使用 Iconify 离线渲染。保持 Lucide 线性图形、`currentColor` 和 2 单位描边，`size` 同时指定宽高；表单前缀默认 16px，其余位置保留既有尺寸层级和容器间距。图标直接输出 SVG，不增加布局包装；默认隐藏装饰图标的无障碍语义，有独立文字标签时使用 `aria-label`。禁止整包图标导入、运行时远程图标请求或新增其他图标渲染依赖。自定义头像、内容指纹和背景示意图不属于通用功能图标，使用独立 SVG。

用户头像统一由 `UserAvatar` 输出 5×5 左右对称点阵，账号 ID 稳定决定图案；名称、尺寸与配色变化不改变点阵。圆角方点呼应品牌标识，头像使用圆形底与资源图标区分；低饱和身份色与当前主题的 `paper` 混合形成底色和未点亮网格，不使用渐变或高光。导航栏、资料页、配色选项与审计记录复用同一生成逻辑，身份色集中在 `theme.css` 定义深浅版本。

带图标前缀的单行输入统一使用 `InputField`，通过 `icon` 显式指定字段语义。Iconify 使用 `@iconify/react/offline` 和 `@iconify-icons/lucide` 单图标静态导入，不按字符串名称请求公共图标 API，也不导入整套图标。前缀为 16px、使用辅助文字色、不接收点击或焦点且对读屏隐藏；输入保留原生 ref、标签、校验、自动填充与表单行为。正文仍为 12px，边框跟随统一主题变量。密码显示按钮使用尾部插槽并预留独立空间。已有前缀的搜索框、关键词复合输入和多行文本域不重复装饰。

Agent 客户端图标集中在 `client-icons.ts`，使用 Iconify 的 Simple Icons / Devicon Plain 单色品牌标识，Pi 使用 Lucide 的 π 符号。通过 `IconComponent` 接口与普通功能图标共用选择控件；选中值与菜单项使用同一映射，继承主题文字色，禁止远程运行时加载图标。

复选项使用原生 `input[type='checkbox']`，由使用 `checkLabelStyles` 的标签包裹，文字放在相邻的 `span` 或 `code` 中；布局与交互统一使用共享的 Tailwind 样式组合。图标按首行行高居中，长文本换行不挤压图标，不使用固定顶部偏移。文本输入框规则必须排除 checkbox 和 radio，避免覆盖选择控件尺寸。

选择控件保留原生标签点击、键盘焦点与表单语义；选中、悬停、按下和禁用状态使用主题色。过渡遵循全局减少动态效果设置，高对比度下复选框恢复系统外观。卡片式单选保留整卡点击和焦点轮廓。

## 注释与文档

注释规则见 [AGENTS.md](../../AGENTS.md#code-conventions--common-patterns)。

文档的改动时机与写法见 [AGENTS.md](../../AGENTS.md#documentation)；同一规则只在其归属文档详述。根 README 只保留项目入口和常用命令。

## Tailwind 样式

Web 使用 Tailwind CSS v4 与 Vite 插件。组件直接使用工具类；较长或复用的工具类组合放在功能目录的 `styles.ts`，跨功能组合放在 `shared/styles/`。通过 `cn()` 合并类名与条件分支，调用者传入的工具类最后合并。

`styles/index.css` 仅引入 Tailwind、HeroUI、主题、基础元素规则和关键帧。主题颜色与字号通过 `@theme` 暴露为语义工具类，浅色与深色变量统一供 HeroUI 弹层使用。不再维护功能 CSS、旧类名映射或兼容样式。

颜色统一在 `styles/theme.css` 定义：`page/paper` 区分页面和容器，`ink/muted-ink` 区分正文和辅助文字，`line` 统一分隔线和输入控件的柔和边框（`control-border` 引用同一变量），`brand/on-brand/brand-soft` 表达主操作与选中态，`success/warning/danger/info` 表达业务状态。每个状态配套 `*-soft` 底色，不能以品牌色代替所有状态。代码区、遮罩、阴影、高光和头像也使用变量；`transparent/currentColor` 保留其关系语义。业务组件不得新增十六进制、RGB、OKLCH 色值或固定色阶工具类。

输入框、文本域、搜索框、日期与下拉框在默认、悬停和展开状态保持同一边框颜色；键盘焦点使用独立的中性外轮廓，校验错误使用危险色。不得给单个页面的输入控件添加品牌色边框覆盖。

默认主题使用暖白与中性石墨灰表面，低饱和钢蓝仅用于主要操作和选中态；正文、辅助图标与容器保持中性。深浅切换使用整页 180ms 淡入，过渡期间暂停组件局部颜色动画；减少动态效果设置下直接切换。

字体以 `ui-sans-serif/system-ui` 为首选，并提供 Segoe UI、Roboto、Helvetica Neue 等平台回退；中文回退到 PingFang SC、Microsoft YaHei UI 和 Noto Sans CJK SC。代码、快捷键和预格式化文本使用 `ui-monospace` 字体栈并关闭连字，避免运算符组合改变阅读形态。标题使用 600、控件标签使用 500、正文使用 400 字重，中文标题不使用过紧的负字距；正文说明不能降为 11px 辅助字号。字号采用固定像素刻度，正文与标签统一 12px、辅助文字 11px、段落标题 17px、共享页头标题宽屏 29px、窄屏 23px；HeroUI 与 Tailwind 的字号变量同步覆盖。响应式字号使用离散断点，不使用产生任意字号的 `vw` 或 `clamp()`。间距基准独立固定为 4px，避免根字号改变布局节奏。

当前提供石墨、海蓝、松绿、暖砂、烟紫五套主题，每套定义完整的深浅语义源色。顶栏「外观设置」在桌面与窄屏均可用，配色与浅色／深色／跟随系统独立选择。偏好以 `capability-hub:appearance` 保存在当前浏览器，渲染前恢复，并通过 storage 事件同步同源标签页；存储不可用时不阻止当次切换。主题偏好不属于账号设置，不跨设备同步。

新增配色时，在 `app/appearance.ts` 登记稳定 ID、名称和说明，并在 `styles/theme.css` 的 base 层添加对应 `:root[data-palette='名称']:not(.dark)` 与 `:root[data-palette='名称'].dark` 完整颜色规则；预览色卡使用同一组声明。`data-theme` 决定深浅模式，`data-palette` 决定配色。不要在业务组件或预览里重复色值，也不要重复 HeroUI 派生变量。主题颜色挂在 `html` 上，保证 Portal 弹层和原生控件继承一致；头像保留用户选择的身份色。所有主题都必须通过文字对比度检查。

`SelectField` 通过 `optionIcons` 按选项值显式传入图标，常用映射在 `shared/components/select-icons.ts`。图标同时用于选项与已选值，并设为 `aria-hidden`；文字仍负责可访问名称、键盘搜索和原生表单值。不要向原生 `option` 嵌入 SVG，也不要根据显示文案自动猜图标。

状态与尺寸变体必须使用完整的静态工具类字符串，不能拼接工具类名。命名 `group/…` 仅作为组件关系或状态标记，本身不定义样式；祖先、子元素及 React Aria 状态使用 Tailwind 变体。DOM 行为查询优先使用 ARIA 或专用 `data-*` 属性，不依赖外观类名。内联样式仅保留运行时尺寸、动画坐标等动态值。

变更需检查深浅主题、窄屏、焦点、禁用态与减少动态效果；默认组件测试不代替浏览器视觉验证。
