@echo off
setlocal
title FirmaChain - Automatic ESP32-S3 USB Bridge

rem The launcher can be placed in any folder; bridge files are fetched into a sibling folder.
set "PROJECT_DIR=%~dp0"
set "BRIDGE_DIR=%PROJECT_DIR%usb_bridge"
set "BRIDGE_SCRIPT=%BRIDGE_DIR%usb_bridge.py"
set "REQUIREMENTS=%BRIDGE_DIR%requirements.txt"

echo.
echo  ==============================================
echo       FirmaChain - ESP32-S3 Auto Connector
echo  ==============================================
echo.

if not exist "%BRIDGE_DIR%" mkdir "%BRIDGE_DIR%"

echo Downloading the latest FirmaChain USB bridge...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/karanbudhanawar-crypto/firmachain/main/usb_bridge/usb_bridge.py' -OutFile '%BRIDGE_SCRIPT%'"
if errorlevel 1 (
    echo ERROR: Could not download usb_bridge.py. Check your internet connection.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/karanbudhanawar-crypto/firmachain/main/usb_bridge/requirements.txt' -OutFile '%REQUIREMENTS%'"
if errorlevel 1 (
    echo ERROR: Could not download bridge requirements.
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

echo.
echo Starting automatic ESP32-S3 detection...
echo Unplugging the board is safe; the bridge will wait and reconnect.
echo Keep this window open while using the cloud dashboard.
echo Press Ctrl+C to stop the bridge.
echo.

py "%BRIDGE_SCRIPT%" --url https://firmachain.onrender.com --port auto

echo.
echo FirmaChain USB bridge stopped.
pause
