# dsh-custom — DeepSeek Harness 定制工具集

[English](README.md) | [Tiếng Việt](README.vi.md) | 中文

**非官方**的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）0.1.5-rc.1 定制集。与
DeepSeek 无从属关系，也未获其背书。

其中大部分以**仓库外（out-of-tree）插件**形式运行：此处内容均不要求修改 harness 的检出（checkout）。唯一
的例外是浏览器传输层的设置，它位于一个小补丁中，因为这些值被固化在 connection 插件内部（见下文）。

## 目录内容

| 目录 | 说明 |
|---|---|
| `locale-vi/` | 越南语语言包：注册 `vi` 语言与 39 个词典的客户端插件 |
| `locale-work/` | 翻译源：39 个 `*.source.json`（英文，从 harness 提取）及其对应的 `*.vi.json` |
| `dsh-web-settings/` | 设置卡片、右侧栏面板、会话记录节点、诊断工具，以及工具守卫 |
| `dsh-llm-echo/` | 离线 LLM 提供方，无需 API key 即可运行 GUI |
| `tools/` | 用于生成与校验上述内容的提取、构建与验证脚本 |
| `deploy/` | 远端访问说明，以及两种访问模式的 Caddyfile |

语言包覆盖范围：**39 个命名空间、1185 个键**，即 Web GUI 发布的全部文案。

## 安装

每个包都是 `dsh` profile 的普通依赖。在检出目录或已安装的 `dsh` 中执行：

```sh
dsh plugin --profile web add /path/to/locale-vi
dsh plugin --profile web add /path/to/dsh-web-settings
dsh plugin --profile web add /path/to/dsh-llm-echo
```

然后在 `$DSH_HOME/profiles/web/cordis.patch.yml` 中挂载它们：

```yaml
- insert:
    - id: locale-vi
      name: dsh-locale-vi
- insert:
    - id: web-publish
      name: dsh-web-settings
- insert:
    - id: llm-echo
      name: dsh-llm-echo
```

重启 `dsh web`。语言包会在 Settings → General → Language 中加入 **Tiếng Việt**；另外两个包会在
Settings → Plugins 下加入卡片、在右侧栏加入一个面板，并提供 `local-echo` 提供方。

### 唯一需要改动仓库的补丁

`dsh-web-settings` 会把已保存的监听 host 与 port 写入 profile 的补丁层，因此 profile 需要设置：

```json
"dsh": { "profile": { "patchReload": "startup" } }
```

若为 `"live"`，插件在启动期间的写入会让 loader 在挂载过程中重新应用整棵树，webserver 行会在其监听套接字仍
打开时重新绑定，导致启动失败。host 与 port 本来就只在下次启动时生效，因此 `startup` 与该功能的语义一致。

`cookieMaxAgeDays`、`trustedHosts` 以及「登出所有浏览器」**不需要**该补丁——但它们需要 `connection` 插件实
时读取其策略，即 `CUSTOMIZE_PLAN.md` §10.3 所述的小补丁。没有它，这些设置仍会被保存，但在重启前**不起作
用**。

## 验证

一切均通过实际运行验证，而非阅读代码。每个脚本输出 `RESULT: PASS` 或失败的断言列表：

| 脚本 | 证明内容 |
|---|---|
| `tools/verify-locale-pack.mts` | 生成的客户端 bundle 可加载、注册 `vi`，并携带全部 39 个命名空间与 1185 个键 |
| `tools/verify-web-settings-client.mts` | 三张卡片、面板与会话节点以正确的 key 注册并可渲染；会话节点的 Definition 只匹配它自己的三个事件族 |
| `tools/verify-web-settings-host.mts` | 设置区段完成安装，工具可执行并渲染，guard 对拦截项直接拒绝而不委派、其余情况正确委派 |
| `tools/verify-llm-echo.mts` | 适配器满足原始流式契约：block start/delta/end 的 index 相互对应，`usage` 在终止 `finish` 之前，其后无任何分片，取消能中止流 |
| `tools/verify-fence-semantics.ps1` | `/api` 的 Host/Origin 围栏判定，以及会话 cookie 与其签发 authority 的绑定 |
| `tools/verify-proxy-model.ps1` | **保留** Host 的反向代理端到端可用；**重写** Host 的代理（nginx 默认行为）会让所有 API 调用失效 |
| `tools/verify-port-precedence.ps1` | 已保存的端口在下次启动时生效，显式 `--port` 仍然优先 |
| `tools/verify-connection-settings.ps1` | 一次设置写入可到达实时围栏、新签发 cookie 的有效期，以及会话吊销 |

需要运行中 profile 的脚本以其启动 token 作为参数，例如：

```powershell
powershell -File tools/verify-fence-semantics.ps1 <TOKEN>
```

## 重新构建语言包

```sh
corepack pnpm exec tsx tools/extract-locales.mts   # 将 harness 词典读入 locale-inventory.json
corepack pnpm exec tsx tools/split-locales.mts     # 在 locale-work/ 下按命名空间拆分
# 编辑 locale-work/<namespace>.vi.json
corepack pnpm exec tsx tools/build-locale-pack.mts # 重新生成 locale-vi/lib/client.js 并校验
```

若译文缺少某个键或丢失 `{placeholder}`，`build-locale-pack.mts` 会拒绝写入。

## 安全

- **切勿公开 Harness home。** `$DSH_HOME/.credentials.yaml` 保存提供方 API key，`settings.yaml` 可能保存更多
  内容。此处的 `.gitignore` 正是因此排除 `.dsh-dev/`。
- **浏览器会话 cookie 等同于远程代码执行权限。** 持有它的人可以在你的工作区中运行工具，并借此读取你的凭
  据。
- **cookie 不含 `Secure` 标志**，因为载体本身没有 TLS。将 UI 暴露到公网域名时，必须在 loopback 监听器之前
  放置终止 TLS 的代理；参见 `deploy/README.md`。
- **切勿直接绑定 `0.0.0.0`。** `dsh web` 正是因此拒绝该参数。
- `trustedHosts` 仅放宽 Host/Origin 围栏，其本身不授予任何访问权限。

## 许可证

MIT，与 harness 一致。`locale-work/*.source.json` 与 `locale-inventory.json` 中提取的英文字符串派生自
DeepSeek Harness，其许可证为 MIT。
