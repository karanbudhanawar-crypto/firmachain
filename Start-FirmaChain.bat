@echo off
setlocal
title FirmaChain - Automatic ESP32-S3 USB Bridge

set "PROJECT_DIR=%USERPROFILE%\Downloads\FirmaChain"
set "BRIDGE_DIR=%PROJECT_DIR%\usb_bridge"
set "BRIDGE_SCRIPT=%BRIDGE_DIR%\usb_bridge.py"
set "REQUIREMENTS=%BRIDGE_DIR%\requirements.txt"

echo.
echo  ==============================================
echo       FirmaChain - ESP32-S3 Auto Connector
echo  ==============================================
echo.

if not exist "%BRIDGE_SCRIPT%" (
    echo ERROR: FirmaChain USB bridge was not found:
    echo   %BRIDGE_SCRIPT%
    echo.
    echo Make sure the repository is downloaded to:
    echo   %PROJECT_DIR%
    echo.
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
    echo ERROR: Cannot open the FirmaChain project folder.
    pause
    exit /b 1
)

py -c "import serial, requests" >nul 2>&1
if errorlevel 1 (
    echo Installing required USB bridge packages...
    py -m pip install -r "%REQUIREMENTS%"
    if errorlevel 1 (
        echo ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
)

echo Starting automatic ESP32-S3 detection...
echo Keep this window open while using the dashboard.
echo Unplugging the board is safe; the bridge will keep waiting.
echo Press Ctrl+C to stop the bridge.
echo.

py "%BRIDGE_SCRIPT%" --url https://firmachain.onrender.com --port auto

echo.
echo FirmaChain USB bridge stopped.
pause
