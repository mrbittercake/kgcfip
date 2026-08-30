@echo off
chcp 936 >nul
setlocal
REM ============================================================
REM  kgcfip 本地测速 Agent - Windows 启动脚本
REM ============================================================
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [错误] 本机未检测到 Node.js。
    echo.
    echo 请先安装 Node.js 16 或更高版本：
    echo     https://nodejs.org/
    echo.
    echo 安装完成后，重新运行本脚本。
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODEVER=%%v"
echo.
echo   kgcfip 本地测速 Agent
echo   Node.js %NODEVER% 已就绪
echo   工作目录：%CD%
echo.
echo   随时按 Ctrl+C 停止服务。
echo ============================================================
echo.

echo   服务启动后，请留意终端显示的端口（默认 15888）。
echo   在网页端将"本地服务端口"设为一致，再点"检测服务"即可。
echo ============================================================
echo.

if "%~1"=="" (
    node agent.js
) else (
    node agent.js %*
)

echo.
echo ============================================================
pause
