@echo off
rem The knight animation player: serves this folder and opens knight.html (close this window to stop).
cd /d "%~dp0"
python tools\knight_player.py
if errorlevel 1 pause
