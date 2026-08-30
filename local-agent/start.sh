#!/usr/bin/env bash
# ============================================================
#  kgcfip 本地测速 Agent - Linux / macOS 启动脚本
# ============================================================
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
    echo ""
    echo "[错误] 未检测到 Node.js。"
    echo ""
    echo "请先安装 Node.js 16 或更高版本："
    echo "    https://nodejs.org/"
    echo "  # 或"
    echo "    brew install node        # macOS"
    echo "    apt install nodejs npm   # Debian / Ubuntu"
    echo ""
    exit 1
fi

echo ""
echo "  kgcfip 本地测速 Agent"
echo "  已检测到 Node.js $(node -v)"
echo "  工作目录：$(pwd)"
echo ""
echo "  服务启动后，请留意终端显示的端口（默认 15888）。"
echo "  在网页端将「本地服务端口」设为一致，再点「检测服务」即可。"
echo ""
echo "  按 Ctrl+C 可随时停止。"
echo "============================================================"
echo ""

if [ $# -eq 0 ]; then
    node agent.js
else
    node agent.js "$@"
fi
