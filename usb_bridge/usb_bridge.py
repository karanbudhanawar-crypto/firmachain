"""Read ESP32-S3 USB serial reports and forward them to FirmaChain.

Install: py -m pip install -r requirements.txt
Run:     py usb_bridge.py --url https://firmachain.onrender.com --port auto

Use --port COM8 to pin the bridge to a specific COM port instead.
"""
import argparse
import json
import sys
import time

import requests
import serial
from serial.tools import list_ports

ESPRESSIF_VID = 0x303A
ESP32_S3_USB_SERIAL_JTAG_PID = 0x1001


def find_esp32_port():
    """Return the unique ESP32-S3 USB Serial/JTAG port, or None if unavailable."""
    matches = [
        port for port in list_ports.comports()
        if port.vid == ESPRESSIF_VID and port.pid == ESP32_S3_USB_SERIAL_JTAG_PID
    ]
    if len(matches) > 1:
        names = ", ".join(port.device for port in matches)
        print(f"Multiple matching Espressif devices found ({names}); use --port COMx to choose one.")
        return None
    return matches[0].device if matches else None


def select_port(requested_port):
    if requested_port.lower() != "auto":
        return requested_port
    return find_esp32_port()


def forward_report(report, base_url):
    if report.get("type") != "firmachain_report":
        return
    payload = {
        key: report[key]
        for key in ("device_id", "firmware_version", "firmware_hash",
                    "security_violation", "note")
        if key in report
    }
    if len(payload.get("firmware_hash", "")) != 64:
        print("Skipped report: firmware hash is unavailable or invalid.")
        return
    try:
        response = requests.post(base_url + "/api/reports", json=payload, timeout=20)
        print(f"{payload.get('device_id', 'unknown')}: HTTP {response.status_code} - {response.text[:400]}")
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"API request failed: {exc}")


def main():
    parser = argparse.ArgumentParser(description="FirmaChain ESP32-S3 USB-to-cloud bridge")
    parser.add_argument("--url", default="https://firmachain.onrender.com",
                        help="FirmaChain base URL")
    parser.add_argument("--port", default="auto",
                        help="Serial port, e.g. COM8, or 'auto' to detect ESP32-S3 USB Serial/JTAG")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--retry-seconds", type=float, default=3.0,
                        help="Seconds between USB reconnect attempts")
    args = parser.parse_args()
    base_url = args.url.rstrip("/")

    print("FirmaChain USB bridge started.")
    print(f"Sending reports to {base_url}/api/reports")
    if args.port.lower() == "auto":
        print("Auto-detection enabled for Espressif VID 303A / PID 1001.")
    else:
        print(f"Using fixed serial port {args.port}.")

    try:
        while True:
            port = select_port(args.port)
            if not port:
                print("ESP32-S3 not found. Waiting for USB device...")
                time.sleep(args.retry_seconds)
                continue

            print(f"Opening {port} at {args.baud} baud...")
            try:
                with serial.Serial(port, args.baud, timeout=1) as ser:
                    print(f"USB serial connected on {port}. Waiting for ESP32 reports...")
                    while True:
                        raw = ser.readline().decode("utf-8", errors="ignore").strip()
                        if not raw or not raw.startswith("{"):
                            continue
                        try:
                            report = json.loads(raw)
                        except json.JSONDecodeError:
                            continue
                        forward_report(report, base_url)
            except (serial.SerialException, OSError) as exc:
                print(f"USB serial disconnected on {port}: {exc}")
                print(f"Retrying in {args.retry_seconds:g} seconds...")
                time.sleep(args.retry_seconds)
    except KeyboardInterrupt:
        print("\nFirmaChain USB bridge stopped.")


if __name__ == "__main__":
    main()
