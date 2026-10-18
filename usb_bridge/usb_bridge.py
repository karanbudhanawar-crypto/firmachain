"""Read JSON reports from an ESP32-S3 USB serial console and forward to FirmaChain.

Install: py -m pip install -r requirements.txt
Run:     py usb_bridge.py --url https://firmachain.onrender.com --port COM5
"""
import argparse
import json
import time
import sys
import requests
import serial
from serial.tools import list_ports


def main():
    parser = argparse.ArgumentParser(description="FirmaChain ESP32-S3 USB-to-cloud bridge")
    parser.add_argument("--url", default="https://firmachain.onrender.com", help="FirmaChain base URL")
    parser.add_argument("--port", required=True, help="Serial port, e.g. COM5")
    parser.add_argument("--baud", type=int, default=115200)
    args = parser.parse_args()
    base_url = args.url.rstrip("/")

    print("Available serial ports:")
    for p in list_ports.comports():
        print(f"  {p.device}: {p.description}")
    print(f"Opening {args.port} at {args.baud} baud...")
    print(f"Sending reports to {base_url}/api/reports")

    while True:
        try:
            with serial.Serial(args.port, args.baud, timeout=1) as ser:
                print("USB serial connected. Waiting for ESP32 reports...")
                while True:
                    raw = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not raw or not raw.startswith("{"):
                        continue
                    try:
                        report = json.loads(raw)
                    except json.JSONDecodeError:
                        continue
                    if report.get("type") != "firmachain_report":
                        continue
                    payload = {k: report[k] for k in (
                        "device_id", "firmware_version", "firmware_hash", "security_violation", "note"
                    ) if k in report}
                    if len(payload.get("firmware_hash", "")) != 64:
                        print("Skipped report: firmware hash is unavailable or invalid.")
                        continue
                    try:
                        response = requests.post(base_url + "/api/reports", json=payload, timeout=20)
                        print(f"{payload['device_id']}: HTTP {response.status_code} - {response.text[:400]}")
                        response.raise_for_status()
                    except requests.RequestException as exc:
                        print(f"API request failed: {exc}")
        except serial.SerialException as exc:
            print(f"Serial connection error: {exc}. Retrying in 5 seconds; check port/cable.")
            time.sleep(5)
        except KeyboardInterrupt:
            print("Stopped.")
            return

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
