@echo off
rem Starts the Khonshu night sky with its phone remote. Needs Python 3.
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (python khonshu_server.py) else (py khonshu_server.py)
pause
