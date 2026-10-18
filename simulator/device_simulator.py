import argparse, hashlib, json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8000"
APPROVED_HASH = hashlib.sha256(b"firmachain-demo-approved-firmware-v1").hexdigest()
HASHES = {
    "approved": APPROVED_HASH,
    "mismatch": hashlib.sha256(b"unapproved-firmware-build").hexdigest(),
    "revoked": hashlib.sha256(b"revoked-firmware-build").hexdigest(),
    "violation": hashlib.sha256(b"violation-demo-firmware").hexdigest(),
}

def post(path, payload):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode())

def main():
    parser = argparse.ArgumentParser(description="FirmaChain ESP32 device simulator")
    parser.add_argument("--scenario", choices=HASHES, default="approved")
    parser.add_argument("--device-id", default="esp32-lab-01")
    args = parser.parse_args()
    h = HASHES[args.scenario]
    # The revoked scenario creates and revokes a release first, so the backend can identify it as revoked.
    if args.scenario == "revoked":
        try:
            post("/api/releases", {"release_id":"sim-revoked-release","version":"0.9.0",
                 "sha256":h,"notes":"Simulator revoked scenario"})
        except urllib.error.HTTPError as e:
            if e.code != 409: raise
        try:
            post("/api/releases/sim-revoked-release/revoke", {})
        except urllib.error.HTTPError as e:
            if e.code != 404: raise
    payload = {"device_id":args.device_id, "firmware_version":"1.0.0-demo",
               "firmware_hash":h, "security_violation":args.scenario=="violation",
               "note":f"Simulator scenario: {args.scenario}"}
    print(json.dumps(post("/api/reports", payload), indent=2))

if __name__ == "__main__":
    main()
