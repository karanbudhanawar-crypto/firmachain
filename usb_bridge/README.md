# FirmaChain USB bridge (Windows)

This bridge lets a physical ESP32-S3 connected to a PC by USB send serial JSON reports to the deployed FirmaChain API. The PC must remain powered on and connected to the internet while bridging.

## 1. Flash firmware

Install Espressif ESP-IDF for Windows and open **ESP-IDF PowerShell**. From the repository root:

```powershell
cd firmware/esp32
idf.py set-target esp32s3
idf.py build
idf.py -p COM5 flash monitor
```

Replace `COM5` with the port shown in Windows Device Manager under **Ports (COM & LPT)**. Exit the monitor with `Ctrl+]` before running the bridge. Ensure the project uses USB Serial/JTAG or USB CDC console configured for your board; some boards expose a USB-to-UART bridge instead.

## 2. Install bridge dependencies

Open Command Prompt in `usb_bridge`:

```cmd
py -m pip install -r requirements.txt
```

## 3. Find the COM port

```cmd
py -m serial.tools.list_ports
```

## 4. Run the bridge

```cmd
py usb_bridge.py --url https://firmachain.onrender.com --port COM5
```

Keep this process running. Each JSON report is forwarded to `POST /api/reports`. Open the public dashboard and look for device `esp32-s3-usb-01`.

## Important limitations

- This is a USB-to-cloud prototype: the board communicates with the PC over USB; the PC forwards reports to Render over HTTPS. USB alone cannot reach the cloud.
- The firmware hash is a running-partition measurement, but a report sent by firmware is not proof against a compromised device. This is not secure remote attestation.
- The running image hash will likely be new to the server's release registry. The dashboard may mark it `investigate` until the exact measured hash is added as an approved release. Approve only firmware you built and trust.
- Network isolation remains simulated in this prototype. The API's response explicitly says no firewall rules changed.
- Do not use this prototype as a production security control. Add device authentication, TLS credential management, secure boot/flash encryption, signed OTA and gateway enforcement before relying on it.
