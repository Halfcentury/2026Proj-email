# 十组邮件小助手

十组邮件小助手提供 Gmail / Outlook 邮件管理、智能分类、回复草稿、批量退订、归档、日历预约、会议和附件处理。界面默认使用简体中文。

项目保留个人课程范围，优先复用现有素材、页面组件、业务函数和接口，保持视觉、交互及操作习惯一致。桌面、组织与企业身份、计费席位、多消息渠道、商业营销和统计分析的相关实现已裁剪，具体行为及验证方式见[课程功能范围](docs/plans/course-scope.md)。

## 主要功能

- **邮箱与 AI 对话**：查看邮件，用自然语言查找信息和起草回复。
- **自动化**：配置邮件规则、测试匹配并查看执行历史。
- **邮件整理**：逐封给出分类和原文证据；保护星标、待处理邮件；勾选后确认归档，并保存操作日志。
- **批量退订与归档**：按发件人或分类整理不需要的邮件。
- **跟进与摘要**：追踪待回复会话，按计划接收邮件摘要。
- **日历和会议**：设置可预约时间、预约链接、会前简报及会议记录。
- **附件处理**：连接 Google Drive、OneDrive，读取、归档并选择回复附件。

## Windows 本地运行

运行环境要求 Node.js 24；pnpm 版本由根目录 `package.json` 固定。

已完成便携运行环境准备时，双击根目录的 **Start-ProjectEmail.cmd**。启动器会运行项目独立的 PostgreSQL、Redis、邮箱服务模拟器和网页应用，不注册 Windows 服务。

首次准备运行环境：

```bash
node apps/web/scripts/local-dev/windows-runtime.mjs
pnpm install
pnpm local:start --backend native
```

打开 [本地邮箱](http://localhost:3000/mail)，通过 Google 登录选择 `developer@example.com`，或通过 Microsoft 选择 `developer@outlook.test`。这是本地演示账户。

按 **Ctrl-C** 停止应用及本次启动的服务。再次运行同一命令即可恢复；若端口被占用：

```bash
pnpm local:start --port 3001
```

## macOS / Linux

安装 Node.js 24、对应版本的 pnpm，以及 Docker Compose 或本机 PostgreSQL / Redis，然后在项目根目录运行：

```bash
pnpm install
pnpm local:start
```

macOS 原生数据库可使用 `brew install postgresql@16 redis` 安装。可用 `--backend native` 或 `--backend docker` 指定启动方式；更多参数见 `pnpm local:start --help`。

## 本地数据和演示范围

启动器的数据、凭据及当前服务地址保存在 `.context/local-dev/`，便携运行环境保存在 `.context/native/`。重启会保留数据库与凭据；邮箱模拟器、Redis 缓存及其他模拟服务会重新初始化。已有环境文件不会被本地启动器覆盖。

本地演示使用模拟邮箱、邮件投递及 AI 服务。AI 返回预设结果，用于验证应用操作流程。连接真实邮箱及模型时，需要使用自己的 OAuth、数据库和 AI 配置。

升级原生 PostgreSQL 主版本前，请备份数据库；同一数据目录应由创建它的数据库主版本打开。

## 品牌与中文界面

默认项目名称为“十组邮件小助手”。需要定制时，在部署环境中配置：

```dotenv
NEXT_PUBLIC_BRAND_NAME=十组邮件小助手
NEXT_PUBLIC_SUPPORT_EMAIL=
# NEXT_PUBLIC_BRAND_LOGO_URL=/your-logo.svg
# NEXT_PUBLIC_BRAND_ICON_URL=/your-icon.png
```

界面文案直接使用简体中文，日历和日期采用中文区域设置。邮箱原文、用户自定义标签、服务商名称、API 字段、工作区依赖和已有数据库标识保持其原有含义。

## 邮件整理配置

侧栏的“邮件整理”使用独立的测试邮箱，内含 12 封固定邮件。分类建议包含原文证据；默认不勾选归档项；归档前需要确认，并记录日志。可重置测试邮箱或导入邮件，也可验证故障重试。

真实 DeepSeek 配置仅存于服务端 `apps/web/.env.local`，此功能与已有自动化规则独立。配置方式及针对性测试见 [邮件整理说明](docs/zh-CN/mail-triage.mdx)。

## 项目文档

中文版入口为 [文档索引](docs/README.md)，按项目说明、使用手册、部署运维和开发接口组织。初次运行见 [快速开始](docs/zh-CN/quick-start.mdx)，技术组成见 [总体架构](docs/zh-CN/architecture.mdx)。

开始整理时的原文及资源已备份到 `archives/documentation/2026-10-13-original.tar.gz`。原有文档继续作为参考保留，文档站导航使用 `docs/zh-CN/` 中的中文版。

## 检查与测试

```bash
pnpm test path/to/test-file.test.ts
pnpm check
pnpm -F inbox-zero-ai test:playwright:emulated <area-or-spec>
```

浏览器检查需要相应的本地服务。修改界面文案后，同步修改依赖可见名称的测试定位器。

## 可选外部 AI 接入

供 Cursor、OpenClaw 等外部工具调用邮箱的接入包暂存于 `extras/ai-integrations/`，包括 MCP 插件、API 技能包及其发现入口，当前不启用。需要使用时，按 [MCP 插件说明](extras/ai-integrations/plugins/inbox-zero-mcp/README.md) 或 [API 技能说明](extras/ai-integrations/clawhub/README.md) 手动安装或恢复入口。

开发工具的专用规则和工作区配置已移除；启动和检查命令见上文。

## 开源来源

本项目基于 [原始开源仓库](https://github.com/elie222/inbox-zero)进行中文适配和品牌定制。许可证与原作者归属保留在 [LICENSE](LICENSE)；上游接口、公开包名及协议标识用于兼容现有依赖。

技术栈包括 Next.js、React、Tailwind CSS、shadcn/ui、Prisma 和 Turborepo。
