@echo off
chcp 65001 > nul
set PYTHONUTF8=1
title Instalar Mesa de Ayuda TI - Mesa de ayuda
cd /d "%~dp0"

echo ============================================
echo    INSTALACION - MESA DE AYUDA TI
echo ============================================
echo.

where python > nul 2>&1
if errorlevel 1 (
    echo [X] No se encontro Python.
    echo     Instalalo desde https://www.python.org/downloads/
    echo     IMPORTANTE: marca la casilla "Add python.exe to PATH".
    pause
    exit /b 1
)

echo [1/4] Creando entorno de Python...
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat

echo [2/4] Instalando librerias...
python -m pip install --upgrade pip -q
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [X] No se pudieron instalar las librerias. Revisa la conexion a internet.
    pause
    exit /b 1
)

echo [3/4] Preparando configuracion...
if not exist .env (
    copy .env.ejemplo .env > nul
    echo     Se creo el archivo .env. Revisalo con el Bloc de notas.
)

echo [4/4] Revisando que todo funcione...
python pruebas.py > nul 2>&1
if errorlevel 1 (
    echo [X] Las pruebas fallaron. Ejecuta "python pruebas.py" para ver el detalle.
    pause
    exit /b 1
)
echo     Pruebas OK

echo.
echo ============================================
echo  Instalacion completa.
echo  Creando las cuentas del equipo de TI
echo  (archivo cuentas-iniciales.csv)
echo ============================================
python gestionar.py cuentas-iniciales
echo.
echo ANOTA LAS CONTRASENAS TEMPORALES DE ARRIBA.
echo Cada uno debera cambiarla al entrar por primera vez.
echo.
echo Listo. Ahora ejecuta "iniciar.bat" para encender el sistema.
pause
