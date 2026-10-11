# iskill-headroom-workbuddy2api

把 WorkBuddy 桌面端内置模型接成一个**任何人都能用的 OpenAI 兼容 API**，供 WorkBuddy / Cursor / 任意 OpenAI 客户端使用。

> **一句话定位：hub 让内置模型「用得上」，headroom 让它「跑得远」。**

```
WorkBuddy 客户端 → Headroom(:8787 守住缓存 + 压增量) → workbuddy2api-hub(:8788 转换) → 官方内置模型
```

| 端口 | 角色 | 带来什么 |
|---|---|---|
| `8788` | **workbuddy2api-hub** | 私有协议转 OpenAI + 看板 OAuth 加账号 + 多账号双区域调度 + 每日保活 —— **没有它，内置模型根本接不出来** |
| `8787` | **Headroom** | 冻结历史前缀**守住上游 prompt cache**（命中 = 未命中的 2%），只压**最新那条增量** —— 让会话**跑得更远、更省** |
| `8786` | 本技能控制台 | 链路健康 / 加账号 / 生效 Key / 日志（`start` 默认一并拉起并自动开浏览器） |

> 完整操作说明见 `SKILL.md`；省 token 方案的调研归档在 `docs/token-savings-research.md`
> （headroom 官方文档 + 本机实测 + 开源横向对比，结论：真正的杠杆是**上游缓存命中率**，不是压缩比）。

---

## 脚本清单

### 跨平台入口（仓库根）

**双击就能用** —— 弹出菜单（启动 / 停止 / 重启 / 状态 / 控制台 / 加账号 / 体检）；启动会连图形控制台（:8786）一起拉起，并自动在默认浏览器打开：

| 文件 | 平台 | 说明 |
|---|---|---|
| `hwb.command` | macOS | Finder 里双击即执行（系统用「终端」打开） |
| `hwb.cmd` | Windows | **双击这个**。`.ps1` 双击是打开记事本，`.cmd` 才用它把 `.ps1` 调起来 |
| `hwb.ps1` | Windows | PowerShell 入口，也可 `.\hwb.ps1 status` 带动作调用 |
| `scripts/hwb.py` | 全平台 | **唯一真源**：所有逻辑都在这里（纯标准库） |

菜单选 **0 退出时会连同窗口一起关掉**（是本终端的最后一个窗口时，顺带退出整个终端 App）。
只对**双击**出来的窗口生效：在自己开着的终端里跑则只是回到提示符，`hwb.command` 靠父进程名
判断、判断不了就保守不关 —— 不会替你关掉正在用的会话。

### 兼容薄壳（`scripts/*.sh`）

每个只有 ~10 行，作用是把参数转给 `hwb.py`。**改逻辑请改 `hwb.py`**。
保持这些文件名是为了兼容既有文档与习惯。

| 脚本 | 作用 |
|---|---|
| `start.sh` | 一键起服务：clone/更新 hub → 生成密钥与配置 → 装 Headroom → 启动 hub + Headroom → 自检 → 拉起图形控制台（:8786）并自动开浏览器 → 打印客户端配置（`--no-open` 不弹浏览器、`--no-console` 不拉控制台） |
| `stop.sh` | 停止全部（hub / headroom / 图形控制台；`--no-dashboard` 保留控制台；含按端口兜底清理，带误杀守卫） |
| `restart.sh` | stop + start（已在运行的控制台复用，不会被杀） |
| `status.sh` | 进程 / 账号池 / 出口区域 / 省 token / 生效 API Key（`--raw` 输出原始 JSON） |
| `login.sh` | 打开看板并等待 OAuth 账号入库（`--no-wait` / `--timeout N`） |
| `dashboard.sh` | 启动 / 构建 / 停止本地控制台（`--build` / `--stop` / `--fg` / `--status` / `--no-open`） |

### 只在 macOS / Linux 上的辅助脚本

这两个是排障与研究工具，没做跨平台适配（Windows 上用不到）：

| 脚本 | 作用 |
|---|---|
| `test-compression.sh` | Headroom 压缩 A/B 对照（临时实例，跑完自清理） |
| `compression_probe.py` | 压缩探针（结构化输出压缩前后差异） |
| `dashboard.py` | 控制台后端（纯 stdlib，127.0.0.1:8786，托管前端产物 + `/api/*`）—— 这个是跨平台的，由 `hwb.py dashboard` 调起 |

> Windows 上不需要这些 `.sh`：等价写法是 `powershell -File hwb.ps1 <动作>`
> 或直接 `py -3 scripts\hwb.py <动作>`。
> 跨平台设计与踩坑（僵尸进程、`os.kill` 在 Windows 会杀进程、`.ps1` 要 BOM…）见
> [`references/cross-platform.md`](references/cross-platform.md)。

### 控制台前端（`dashboard/`）

React + Vite + TS + Tailwind 工程，构建产物 `dashboard/dist/` 由 `dashboard.py` 单端口托管（**运行时不需要 Node**）。

| 文件 | 作用 |
|---|---|
| `dashboard/package.json` | React 19 / Vite 8 / TS 7 / Tailwind 4（`npm run dev` 开发、`npm run build` 构建） |
| `dashboard/vite.config.ts` | `base: "./"`（相对路径，便于单端口托管）+ dev 时 `/api` 反代到 8786 |
| `dashboard/src/App.tsx` | 页面装配 |
| `dashboard/src/hooks/useStatus.ts` | 5 秒轮询 `/api/status` |
| `dashboard/src/api.ts` / `src/types.ts` | 接口封装与类型（与 `dashboard.py` 返回结构一一对应） |
| `dashboard/src/components/` | `ChainCard`(链路) / `PoolCard`(账号池+OAuth) / `SavingsCard`(省流) / `ClientCard`(客户端配置) / `AccountsTable` / `LogsCard` / `ui.tsx` |
| `dashboard/public/` | 站点图标：`favicon.svg`（矢量主件）+ `favicon-32.png` + `apple-touch-icon.png` |
| `dashboard/tools/make-icon.py` | 图标生成脚本（零依赖纯几何）：品牌绿 `#10C8A1` 底板 + 手绘白鲸，改形状/配色后重跑即覆盖 `public/favicon.svg` |

---

## 运行时目录

所有运行态数据都在 `~/.iskill-headroom-workbuddy2api/`，技能目录只放文档与脚本：

```
~/.iskill-headroom-workbuddy2api/
├── workbuddy2api-hub/     # 上游源码（零依赖，git 仓库）
├── hub-accounts/          # 账号凭证 + settings.json（与源码分离，升级不丢）
├── hub-usage/             # 请求流水 usage.jsonl
├── hub.env                # 本技能生成的 API_KEY / PANEL_PASSWORD / HUB_PORT
├── headroom.env           # Headroom 配置（OPENAI_TARGET_API_URL 指向 hub）
├── venv/                  # 仅供 Headroom 使用（hub 与控制台都是纯 stdlib，不需要）
├── logs/                  # hub.log / headroom.log / dashboard.log / dashboard-build.log
├── dashboard.pid
└── pids.json              # hub / headroom 的 PID
```

> 用环境变量 `ISKILL_RUNTIME` 可整体挪到别处。

> 依赖同步：本仓库含 iskill 共享真源的 vendored 副本（清单见 `package.json` 的 `iskillDeps`），**不要手改**。使用前请同时安装 iskill-utils：对 agent 说「请帮我安装 Skill：aispin/iskill-utils」；用法见 SKILL.md「依赖同步」节。
