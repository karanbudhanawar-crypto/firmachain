# FirmaChain
Blockchain-Based Firmware Integrity Verification and Automatic Network Isolation for ESP32 IoT Devices

This is a runnable **development prototype** based on the 17-page project brief. It includes a FastAPI backend, browser dashboard, SQLite development database, hash-chained tamper-evident audit log, device simulator, Solidity registry starter, ESP-IDF firmware starter, gateway isolation adapter, Docker Compose, and tests.

## Important scope and safety
- The default gateway mode is **simulation only**. It does not change firewall rules.
- The default ledger is a local hash-chained audit log. It is tamper-evident, but it is **not a public blockchain**. `contracts/FirmwareRegistry.sol` is the Solidity/EVM starting point for the blockchain integration phase.
- The default database is SQLite to make local setup easy. `docker-compose.yml` also provides PostgreSQL for the deployment-oriented setup.
- Firmware hash reporting from a device is evidence, not proof that a compromised device is telling the truth. Production deployments need hardware-backed identity/attestation, Secure Boot, signed OTA, key management, and a trusted measurement path.
- Only test network devices you own or are explicitly authorized to administer. Do not enable firewall enforcement on a production network without reviewing the rules and recovery path.

## 1. Requirements
- Python 3.10+
- Windows, macOS, or Linux
- Optional: Docker Desktop
- Optional hardware phase: ESP32-S3 development board and ESP-IDF
- Optional blockchain phase: local EVM such as Hardhat/Anvil and a Solidity compiler

## 2. Run locally (SQLite, no Docker required)
Open a terminal in this folder:

```bash
python -m venv .venv
# Windows:
.venv\\Scripts\\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

Open http://127.0.0.1:8000 for the dashboard and http://127.0.0.1:8000/docs for the API.

## 3. Connect a physical ESP32-S3
The dashboard now shows a device as online only when the backend receives a recent report from the USB bridge. A USB connection to the PC alone does not connect the board to the cloud.

1. Flash the firmware using the steps in `usb_bridge/README.md`.
2. Connect the ESP32-S3 with a USB data cable and identify its COM port in Windows Device Manager.
3. In a terminal, install the bridge dependency: `py -m pip install -r usb_bridge/requirements.txt`.
4. Run `py usb_bridge/usb_bridge.py --url https://firmachain.onrender.com --port COM5`, replacing `COM5` with your actual port.
5. Keep the bridge terminal open. The dashboard checks hardware status every five seconds; a recent report is considered online for 45 seconds.

For local development, the API can also be run using the steps above. Simulator scenarios remain available for isolated software tests, but they are not physical-device evidence.

### Security scope
The API compares the reported firmware SHA-256 with registered releases and records decisions in the audit log. Unknown hashes require review and should only be approved after verifying the exact firmware build. Network isolation is still simulated, and serial reports are not hardware-backed remote attestation.

## 4. API overview
- `GET /api/health`
- `GET /api/hardware/status`
- `GET /api/devices`
- `POST /api/devices/register`
- `POST /api/reports`
- `GET /api/releases`
- `POST /api/releases`
- `POST /api/releases/{release_id}/revoke`
- `GET /api/incidents`
- `GET /api/audit`
- `POST /api/devices/{device_id}/recovery-check`
- `POST /api/devices/{device_id}/reconnect`
- `GET /api/metrics`

Interactive API docs: `/docs`.

## 5. Environment variables
- `DATABASE_URL`: defaults to `sqlite:///./firmachain.db`
- `GATEWAY_MODE`: `simulation` (default) or `nftables`
- `ALLOW_FIREWALL_CHANGES`: must be `true` before nftables mode will execute firewall commands
- `FIRMWARE_HASH_DEMO`: seeded demo hash

**Do not enable `nftables` mode on a real network for a classroom demo.** The adapter is intentionally conservative and requires an explicit opt-in. Review `gateway/nftables_adapter.py` first.

## 6. Docker Compose
```bash
docker compose up --build
```
This starts the API and PostgreSQL. The app defaults to SQLite unless `DATABASE_URL` is set. To use the PostgreSQL service, set `DATABASE_URL=postgresql+psycopg://firmachain:firmachain_dev_only@db:5432/firmachain` in the backend environment. Change all demo credentials before any non-local deployment.

## 7. ESP32-S3 firmware starter
See `firmware/esp32/`. It is a starter outline, not a production secure-boot implementation. Configure Secure Boot and signed OTA through the official ESP-IDF tooling for your exact ESP32-S3 target and security requirements.

## 8. Solidity registry starter
See `contracts/FirmwareRegistry.sol`. It stores release hashes, approval state, and revocation state. It is not wired to the backend by default; connect it to a local EVM in the blockchain integration phase.

## 9. Test
```bash
pytest -q
```

## 10. PDF requirements coverage
| PDF requirement | Included in this starter |
|---|---|
| ESP32-S3 device and identity | Device simulator + ESP-IDF starter |
| Firmware SHA-256 and approval check | Backend report validation |
| Approved/revoked releases | Release API and Solidity contract |
| Security incidents and audit | Incident API + hash-chained ledger |
| Automatic isolation | Gateway adapter; simulation by default |
| Offline cached policy concept | Gateway policy cache module |
| Safe recovery and reconnection | Recovery-check and reconnect APIs |
| Dashboard | Static responsive dashboard |
| PostgreSQL | Compose service + configurable database URL |
| MQTT/TLS or authenticated HTTPS | HTTPS-ready API; MQTT integration is a next phase |
| Performance evaluation | Basic latency/decision metrics endpoint |
| Eight-month plan / team tasks | `docs/IMPLEMENTATION_PLAN.md` |

## 11. Suggested development milestones
Use the eight phases in `docs/IMPLEMENTATION_PLAN.md`. Start with the simulator and API, then hardware-backed firmware security, blockchain integration, gateway enforcement in an isolated lab, offline behavior, testing, and final documentation.

## Physical ESP32-S3 over USB (prototype)

A Windows USB-to-cloud bridge and ESP-IDF serial-report firmware starter are included:
- `firmware/esp32/` — ESP32-S3 firmware that prints JSON reports over its configured USB serial console.
- `usb_bridge/` — Windows Python bridge that reads those reports over USB and forwards them to the deployed API over HTTPS.

See `usb_bridge/README.md` for setup. This is a prototype, not secure remote attestation; the bridge PC must remain connected, and network isolation is still simulated.
