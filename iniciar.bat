@echo off
chcp 65001 > nul
set PYTHONUTF8=1
title Mesa de Ayuda TI - NO CERRAR ESTA VENTANA
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python servidor.py
pause
