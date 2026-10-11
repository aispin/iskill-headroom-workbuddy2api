#!/usr/bin/env bash
# iskill-headroom-workbuddy2api · 双击运行入口（macOS）
#
# 在 Finder 里双击本文件即可（.command 会被「终端」打开并执行）。
# 无参数 = 交互菜单；也可以在终端里 ./hwb.command status 这样用，参数原样透传。
#
# 薄壳设计：真正的逻辑全在 scripts/hwb.py（一份跨平台代码），
# 本文件只负责「找到 python + 把参数转过去 + 收尾关窗」。
#
# 每一步都写日志：~/.iskill-headroom-workbuddy2api/logs/launcher.log
# （关窗这件事依赖 osascript，可能被系统权限拦下；没有日志就只能靠猜。）

cd "$(dirname "$0")" || exit 1
here="$(pwd)"
me="$(basename "$0")"
LOGDIR="${HOME}/.iskill-headroom-workbuddy2api/logs"
mkdir -p "$LOGDIR" 2>/dev/null
LAUNCH_LOG="${LOGDIR}/launcher.log"
launch_log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >>"$LAUNCH_LOG" 2>/dev/null; }

# 关掉本脚本所在的窗口/标签页（按 tty 精确定位，绝不关别的窗口）；
# 若这是终端里最后一个窗口，连整个终端 App 一起退。
# 只对 Terminal.app 与 iTerm2 执行（SSH 会话、VS Code 等其他宿主直接跳过）。
# ⚠️ osascript 必须「后台 + 延迟」：此刻 bash 自己还占着窗口，同步 close/quit
#    会弹「关闭窗口将终止正在运行的进程」确认框。失败原因写进日志。
close_terminal_window() {
  local my_tty short script
  my_tty="$(tty 2>/dev/null || true)"
  [ -n "$my_tty" ] || my_tty="/dev/$(ps -o tty= -p $$ 2>/dev/null | tr -d ' ')"
  short="${my_tty##*/}"
  launch_log "close: my_tty=[$my_tty] short=[$short] TERM_PROGRAM=[${TERM_PROGRAM:-}]"

  if [ -n "${SSH_CONNECTION:-}" ]; then
    launch_log "close: SSH 会话没有本地窗口可关 → 跳过"
    return
  fi
  case "${TERM_PROGRAM:-}" in
    iTerm.app)
      ( sleep 0.3
        out=$(/usr/bin/osascript -e 'tell application "iTerm2"
            if (count of windows) <= 1 then
              quit
            else
              close current window
            end if
          end tell' 2>>"$LAUNCH_LOG")
        launch_log "close: iTerm osascript rc=$? out=[$out]" ) >/dev/null 2>&1 &
      return ;;
    ""|Apple_Terminal) : ;;  # Terminal.app，走下面的主路径
    *)
      launch_log "close: TERM_PROGRAM=[${TERM_PROGRAM:-}] 不是 Terminal/iTerm → 跳过关窗"
      return ;;
  esac

  # 主路径：按 tty 命中后先试关标签（多标签窗口更礼貌），失败再关整个窗口；
  # **实际关掉了**且这是最后一个窗口 → quit 整个 App。
  # ⚠️ quit 必须以 didClose 为前提：关窗被权限拦下时若无条件 quit，会误退整个终端 App。
  script="
tell application \"Terminal\"
    set myTTY to \"$short\"
    set allTTYs to {}
    set didClose to false
    set nWin to count of windows
    repeat with w in windows
        if didClose then exit repeat
        set hit to false
        repeat with t in tabs of w
            set tt to (tty of t) as string
            set end of allTTYs to tt
            if (tt is myTTY) or (tt is \"/dev/\" & myTTY) then
                set hit to true
                try
                    close t
                    set didClose to true
                end try
                exit repeat
            end if
        end repeat
        if hit and not didClose then
            close w
            set didClose to true
        end if
    end repeat
    if didClose and nWin <= 1 then quit
    return \"didClose=\" & didClose & \" nWin=\" & nWin & \" ttys=\" & (allTTYs as string)
end tell"
  ( sleep 0.3
    out=$(/usr/bin/osascript -e "$script" 2>>"$LAUNCH_LOG")
    launch_log "close: Terminal osascript rc=$? out=[$out] myTTY=[$short]" ) >/dev/null 2>&1 &
}

PY="${ISKILL_PYTHON:-}"
if [ -z "$PY" ] || [ ! -x "$PY" ]; then
  PY="$(command -v python3 || command -v python)"
fi
if [ -z "$PY" ]; then
  echo "找不到 Python 3 —— 装一个（brew install python3，或 python.org 安装包）后重试。"
  echo
  printf "按回车键关闭窗口…"
  read -r _
  exit 1
fi

"$PY" "$here/scripts/hwb.py" "$@"
rc=$?
launch_log "run: $me $* → rc=$rc"

# ── 收尾 ────────────────────────────────────────────────────
# rc=10 = 用户在菜单里选了退出（hwb.py 只表达意图，关窗由本壳执行）。
# 无参数 + 交互终端 → 关窗（这是最后一个窗口时，整个终端 App 一起退）；
# 带参数（status / stop …）或非交互 → 直接退出，绝不碰窗口。
#
# ⚠️ 关键顺序：先 exit，再让后台 osascript 关窗，中间隔 ~0.3s。
#    绝不能 exec 一个交互 shell —— 那会让窗口里留下活动进程，
#    Terminal 关窗时就会弹「关闭窗口将终止正在运行的进程」确认框。
#    正确姿势是让本 shell 先退出、窗口变空闲，osascript 再来关，静默完成。
if [ "$rc" -eq 10 ] && [ "$#" -eq 0 ] && [ -t 0 ]; then
  close_terminal_window
  exit 0
fi

# 启动失败等非正常结束：等一次回车再关窗。
if [ "$#" -eq 0 ] && [ -t 0 ]; then
  echo
  printf "按回车键关闭窗口…"
  read -r _ || true
  close_terminal_window
fi
exit $rc
