@echo off
rem One click to a running sky: fullscreen, music playing, no Begin button. Needs Python 3 and
rem Edge or Chrome. Press Alt+F4 on the sky to close it, then close this window.
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (python khonshu_server.py --kiosk) else (py khonshu_server.py --kiosk)
pause
