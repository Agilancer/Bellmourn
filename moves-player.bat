@echo off
rem The move picker: serves this folder and opens moves.html (close this window to stop).
cd /d "%~dp0"
python tools\moves_player.py
if errorlevel 1 pause
