@echo off
setlocal EnableExtensions

REM GST Reconciliation - Windows Desktop Build
REM Output: dist\GSTReco\GSTReco.exe
REM Run this from the project folder. Window stays open at the end so messages can be read.

cd /d "%~dp0"

REM ---- Choose Python: project .venv first, then the py launcher, then python on PATH ----
set "PYTHON="
if exist ".venv\Scripts\python.exe" set "PYTHON=%~dp0.venv\Scripts\python.exe"

if not defined PYTHON (
    where py >nul 2>&1
    if not errorlevel 1 set "PYTHON=py -3"
)

if not defined PYTHON (
    where python >nul 2>&1
    if not errorlevel 1 set "PYTHON=python"
)

if not defined PYTHON (
    echo ERROR: Python nahi mila.
    echo Python 3.12 install karein ^(python.org se, "Add python.exe to PATH" tick karke^) aur phir dobara chalayein.
    goto :fail
)

echo Using Python:
%PYTHON% --version
if errorlevel 1 goto :fail

echo.
echo Installing dependencies...
%PYTHON% -m pip install -r requirements.txt -r requirements-desktop.txt
if errorlevel 1 goto :fail

echo.
echo Cleaning previous build...
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
if exist GSTReco.spec del /q GSTReco.spec

echo.
echo Building GSTReco.exe...
%PYTHON% -m PyInstaller --noconfirm --onedir --windowed --name GSTReco ^
  --icon "app.ico" ^
  --add-data "gst_suite_app.py;." ^
  --add-data "app.ico;." ^
  --add-data "assets;assets" ^
  --collect-all streamlit --copy-metadata streamlit ^
  --collect-all webview ^
  launcher.py
if errorlevel 1 goto :fail

if not exist "dist\GSTReco\GSTReco.exe" (
    echo ERROR: dist\GSTReco\GSTReco.exe nahi bana.
    goto :fail
)

echo.
echo BUILD SUCCESSFUL!
echo Run: dist\GSTReco\GSTReco.exe
echo.
pause
exit /b 0

:fail
echo.
echo BUILD FAILED. Upar ka error message dekhein.
echo.
pause
exit /b 1
