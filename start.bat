@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Claude CLI Web UI Manager

:MENU
cls
echo.
echo  ============================================
echo       Claude CLI Web UI Manager
echo  ============================================
echo.
echo   [1] Start Dev Server
echo   [2] Stop Dev Server (port 6523)
echo   [3] Stop All Node.js on port 6523
echo   [4] Show Port 6523 Status
echo   [0] Exit
echo.
set /p choice="  Select: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto STOP_ALL
if "%choice%"=="4" goto STATUS
if "%choice%"=="0" goto EOF
goto MENU

:START
cls
echo.
echo  Starting Claude CLI Web UI on port 6523 ...
echo  Press Ctrl+C to stop the server.
echo.
pnpm dev
pause
goto MENU

:STOP
cls
echo.
echo  Stopping processes on port 6523 ...
echo.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":6523 " ^| findstr "LISTENING"') do (
    echo  Killing PID %%a ...
    taskkill /PID %%a /T /F >nul 2>&1
)
echo.
echo  Done.
pause
goto MENU

:STOP_ALL
cls
echo.
echo  Stopping ALL processes on port 6523 (LISTENING + ESTABLISHED) ...
echo.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":6523 "') do (
    echo  Killing PID %%a ...
    taskkill /PID %%a /T /F >nul 2>&1
)
echo.
echo  Done.
pause
goto MENU

:STATUS
cls
echo.
echo  Port 6523 status:
echo.
netstat -aon | findstr ":6523 "
if errorlevel 1 (
    echo  Port 6523 is free.
) else (
    echo.
    echo  Port 6523 is in use. Details above.
)
echo.
pause
goto MENU

:EOF
