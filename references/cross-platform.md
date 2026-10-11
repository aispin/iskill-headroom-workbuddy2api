# 跨平台实现说明（macOS / Windows / Linux）

> 📌 **通用方法论的真源已迁到 `iskill-script-launcher`**（`~/.workbuddy/skills/iskill-script-launcher/`）。
> 那里有可抄的启动器骨架（`.command` / `.ps1` / `.cmd` / `launcher.py` 四件套）与
> 按「症状 → 根因 → 修法」组织的坑清单。**本文件保留本技能的具体实现说明**，
> 新增的通用结论请写到那边，避免两处漂移。

> 这份文件解释「为什么长这样」，以及踩过的坑。想加功能看最后一节。

## 一、为什么是「一份 Python + 各平台薄壳」

原来的实现是 6 个 bash 脚本（`start.sh` / `stop.sh` / `restart.sh` / `status.sh` /
`login.sh` / `dashboard.sh`），在 Windows 上跑不了。有两条路：

| 方案 | 结果 |
|---|---|
| 把 6 个脚本翻译成 PowerShell，两套并存 | ✗ 逻辑写两遍，改一处漏一处，行为必然漂移 |
| **一份 Python 实现 + 各平台薄壳** | ✓ 只有一个真源 |

选后者的决定性理由是：**这套东西本来就依赖 Python** ——

- `workbuddy2api-hub` 本身就是零三方依赖的 Python 程序；
- Headroom 装在 Python venv 里；
- 控制台后端 `dashboard.py` 是纯 stdlib 的 Python。

所以「用 Python 写启动器」**不引入任何新依赖**，还顺手得到了 Linux 支持。

```
hwb.command   ─┐                    ┌─→ start / stop / restart / status
hwb.ps1 / hwb.cmd ─┼→ scripts/hwb.py ─┼─→ login / dashboard / open / doctor / menu
scripts/*.sh  ─┘   （唯一真源）      └─→ （无参数 = 交互菜单）
```

薄壳只干三件事：找到 Python、把参数转过去、双击时收尾停一下别让窗口秒关。

## 二、平台差异对照（都在代码里处理了）

| 维度 | POSIX（macOS/Linux） | Windows | 代码位置 |
|---|---|---|---|
| venv 可执行文件 | `venv/bin/{python,pip,headroom}` | `venv\Scripts\{python.exe,pip.exe,headroom.exe}` | `venv_paths()` |
| 无害启动独立进程 | `start_new_session=True` | `DETACHED_PROCESS \| CREATE_NEW_PROCESS_GROUP \| CREATE_NO_WINDOW` | `start_process()` |
| 结束进程 | `SIGTERM` → 2s → `SIGKILL` | `taskkill /PID n /T /F`（`/T` 收子进程） | `kill_pid()` |
| 存活探测 | `os.kill(pid, 0)` + 排僵尸 | `OpenProcess` + `GetExitCodeProcess == STILL_ACTIVE` | `pid_alive()` |
| 端口 → 进程 | `lsof -nP -iTCP:N -sTCP:LISTEN -Fpc` | `netstat -ano` + `tasklist` 取名 | `port_owners()` |
| 文件权限收紧 | `os.chmod(f, 0o600)` | 跳过（Windows 用 ACL，chmod 无意义） | `do_start()` |
| 打开浏览器 | `open` / `xdg-open`；开前先探 Safari/Chrome/Edge/Brave/Arc 是否已有同址 tab，有则跳过（Apple Events 被拒等失败一律降级为正常打开） | `os.startfile`（无轻量 tab 枚举手段，跳过去重，直接开） | `open_url()`（首选 `webbrowser`） |
| 找 npm | `shutil.which` + Homebrew 两条 | `shutil.which("npm.cmd")` | `find_npm()` |
| PATH 分隔符 | `:` | `;` | `os.pathsep` |
| 控制台编码 | 本来就是 UTF-8 | 默认 GBK → `SetConsoleOutputCP(65001)` | `_init_console()` |

`process_name` / `ps` 相关代码有意做得**可失败**：拿不到进程名时保守跳过，不猜。

## 三、踩过的坑（每个都有代价）

### 1. `os.kill(pid, 0)` 在 Windows 上会**杀掉**进程

Python 文档：Windows 下除 `signal.CTRL_C_EVENT` / `CTRL_BREAK_EVENT` 外的信号，
一律走 `TerminateProcess`。所以「用 `os.kill(pid, 0)` 探活」在 Windows 上等于**无条件杀人**。
→ 改用 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess`，
退出码 `259`（`STILL_ACTIVE`）才算活着。

### 2. 僵尸子进程会被误判成「还活着」

POSIX 上子进程死掉但没被 reap 时，PID 表项还在，`os.kill(pid, 0)` **依然成功**。
实测现象：`stop` 打印「已停止 PID x」、`pids.json` 也清了，但紧接着判存活仍是 `True`。
→ `pid_alive()` 先 `os.waitpid(pid, WNOHANG)`：返回了 pid 说明是我们自己的僵尸，顺手收尸并判死；
不是自己的子进程（`ChildProcessError`，守护进程重启后的常态）再往下走 `os.kill` +
`ps -o state=` 看有没有 `Z`。

### 3. `ps` 不一定能用

macOS 沙箱里 `ps` 会 `operation not permitted`（`/bin/ps` 是 setuid root 且被策略拦），
某些最小化容器也没有。所以**进程名一律优先走 `lsof -Fpc`**（`p<pid>` / `c<命令名>` 逐行），
`ps` 只当僵尸判定的补充。名字取不到 → `looks_like_ours()` 返回 `False` → 跳过，**宁可漏清也不错杀**。

### 4. 「按端口兜底清理」必须有误杀守卫

同一个端口上完全可能是别人的程序。所以按端口清理前先验进程名：
只有 `python*` / `headroom*` 才动，其它一律打印「不像本服务，跳过」。
（`pids.json` 里显式登记的 PID 不设这道门 —— 那是我们自己写下的。）

### 5. `.ps1` 双击 = 打开记事本，不是执行

Windows 上 `.ps1` 的默认关联是编辑。要「双击就跑」必须有个 `.cmd` 垫片：

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0hwb.ps1" %*
```

`-ExecutionPolicy Bypass` 也是必需的 —— 默认策略会拦下未签名脚本。

### 6. `.ps1` 必须带 UTF-8 BOM

Windows PowerShell 5.1 在没有 BOM 时按 **ANSI（中文机器上是 GBK）** 解码脚本文件，
里面的中文注释和提示会全变乱码。写入时用 `encoding="utf-8-sig"`。
（顺手在 `hwb.ps1` 开头设了 `[Console]::OutputEncoding = UTF8`。）

### 7. 中文输出在 Windows 控制台会乱码

不是脚本的错，是控制台代码页默认 936（GBK）。用
`kernel32.SetConsoleOutputCP(65001)` + `sys.stdout.reconfigure(encoding="utf-8")` 修。
`.cmd` 文件本身刻意**全 ASCII**，避免 cmd.exe 的编码麻烦。

### 8. 「退出菜单时关掉窗口」——两平台的代价完全不对等

用户双击进来、菜单里选 0 退出，期望窗口跟着关掉（最后一个窗口则退掉整个终端 App）。
macOS 上关窗靠 AppleScript，误伤面必须压到最小，所以做法是：

- `hwb.py` 只用一个**约定退出码** `EXIT_MENU_QUIT = 10` 表达「用户主动退出菜单」，
  自己不碰任何关窗动作（Python 不该知道宿主是谁）。
- `hwb.command` 收到 rc=10 且**无参数、交互终端** → 按 **tty 精确关窗**：
  1. **宿主白名单**：只对 Terminal.app（`TERM_PROGRAM=Apple_Terminal`）与 iTerm2
     执行 AppleScript；SSH 会话（`SSH_CONNECTION` 非空）没有本地窗口可关，
     VS Code 等第三方终端有自己的窗口协议，一律跳过；
  2. AppleScript 遍历窗口/标签按 **tty 匹配**（`tty` 拿全路径，`ps -o tty=` 兜底），
     避免 `close front window` 关错用户切走的窗口；
  3. 先试 `close t`（多标签窗口更礼貌），失败则 `close w`（关整个窗口）；
  4. **实际关掉了**且这是最后一个窗口才 `quit` 整个 App —— quit 必须以 didClose
     为前提，否则关窗被权限拦下时会把整个终端 App 一起带走。
- ⚠️ **关窗的顺序是「先 exit，再让后台 osascript 关」**，中间隔 ~0.3s：
  ```bash
  close_terminal_window   # 内部是 ( sleep 0.3; osascript … ) &
  exit 0                  #  ← 必须 exit，绝不能 exec 一个交互 shell
  ```
  踩过：为了「关不掉也不留死窗口」加 `exec zsh` 兜底 —— 结果 exec 出来的 shell
  是**活动进程**，Terminal 关窗时判定「窗口里有正在运行的进程」，弹出确认框要用户再点一次。
  正确姿势是让本 shell 先退出、窗口变空闲，osascript 再来关，全程静默；
  关窗失败就让它失败（日志里有原因），不要用 exec 兜底。
- ⚠️ **`osascript rc=0` ≠ 窗口真的关了**。踩过：把 `close t` 包在 `try … end try` 里，
  AppleScript 报错被吞、退出码仍是 0，于是「判定对 + rc=0 + 窗口没关」，完全看不出哪错了。
  正确做法：① `try` 只包住单次 close 动作，结果落进 `didClose` 标志；
  ② AppleScript `return` 一个状态串（`didClose=` / `nWin=` / 所有 tab 的 tty 列表），
  并把它连同 rc 一起**写进日志**。
- ⚠️ 关**标签页**（`close t`）在 Terminal 上并不总是生效；可靠的是命中 tty 后 `close w`
  （关整个窗口）—— 这是从 `migrate_presets.command` 那里学来的已验证写法。
  策略：先试 `close t`（多标签窗口更礼貌），失败则 `close w`；
  **didClose 为真**且只剩一个窗口时才 `quit` 整个 App。
- **Windows 不用判父进程**：双击 `hwb.cmd` 起的窗口，脚本一结束 cmd 自己就关；
  在已有 PowerShell 里跑 `.\hwb.ps1` 则只是返回提示符。窗口生命周期天然分开，
  只要菜单退出时**跳过 `Read-Host`** 即可（否则那个「按回车键关闭」会挡住自动关闭）。

## 四、怎么加一个新动作

1. 在 `hwb.py` 里写 `def do_xxx() -> int`（返回 0/非 0，别在函数里 `sys.exit`）。
2. 注册到 `main()` 的 `sub = ap.add_subparsers(...)` 里加一行 `sub.add_parser("xxx", help="…")`，
   以及对应的 `if a == "xxx": return do_xxx()`。
3. 想出现在双击菜单里，再加进 `MENU` 列表（`("9", "说明", lambda: do_xxx())`）。
4. 需要的话在 `scripts/` 加个同名 `.sh` 薄壳（三行，照抄邻文件即可）。
5. 更新 `SKILL.md` 与 `README.md` 的脚本清单。

## 五、改完怎么验（本机 macOS 实测清单）

真实服务在跑的时候**不要**直接停它。用临时运行时 + 未占用端口做隔离测试：

```bash
PY=~/.workbuddy/binaries/python/versions/3.13.12/bin/python3
cd ~/.workbuddy/skills/iskill-headroom-workbuddy2api

# 只读的
$PY scripts/hwb.py doctor
$PY scripts/hwb.py status
printf '0\n' | $PY scripts/hwb.py          # 菜单能渲染、能退出

# 隔离的（不碰真实服务：换运行时 + 换端口 + 假进程）
TMP=$(mktemp -d)
ISKILL_RUNTIME=$TMP $PY - <<'EOF'
import sys, os, subprocess, time, pathlib
sys.path.insert(0, "scripts"); import hwb
rt = pathlib.Path(os.environ["ISKILL_RUNTIME"])
hwb.RUNTIME, hwb.PIDS = rt, rt / "pids.json"
hwb.HUB_PORT, hwb.HEADROOM_PORT, hwb.DASH_PORT = 18788, 18787, 18786
a = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
rt.mkdir(parents=True, exist_ok=True); hwb.write_pids(a.pid, a.pid)
assert hwb.do_stop() == 0
a.wait()
assert not hwb.pid_alive(a.pid) and not hwb.PIDS.exists()
print("✓ stop 隔离测试通过")
EOF

# 收尾必做：确认真实服务还在
curl -s -o /dev/null -w "%{http_code}\n" --noproxy '*' http://127.0.0.1:8788/health
```

Windows 侧无法在本机端到端验证的部分（`taskkill` / `OpenProcess` / `netstat` 解析 /
`venv\Scripts` 布局），改的是标准库的既定行为，逻辑上等价 —— 首次在真机上跑时
优先用 `.\hwb.ps1 doctor` 确认端口与依赖探测正常，再 `.\hwb.ps1 start`。
