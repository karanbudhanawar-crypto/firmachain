# FirmaChain implementation plan (8 months)

Based on the eight phases in the project PDF.

| Phase | Timing | Work | Exit milestone |
|---|---|---|---|
| 1. Foundation | Weeks 1–2 | Set up Python API, ESP32/ simulator, database, and isolated test network | Device/simulator communicates with backend |
| 2. Firmware verification | Weeks 3–4 | Device identity, SHA-256 measurement, approved-release checks, mismatch handling | Unapproved hash is detected |
| 3. Blockchain integration | Weeks 5–6 | Deploy Solidity registry to local EVM; approve/revoke releases; write incident events | Backend can query/write on-chain records |
| 4. Initial integration | Weeks 7–8 | Integrate API, dashboard, audit log, and gateway simulation | Demonstrable 7th-semester prototype |
| 5. Device security and isolation | Month 3–4 | Configure Secure Boot and signed OTA; gateway rules and restricted recovery path | Isolated lab tests pass |
| 6. Offline operation and recovery | Month 4–5 | Signed cached policy, outage behavior, event synchronization, controlled reconnect | Safe operation during backend outage |
| 7. Testing and optimization | Month 5–7 | Test mismatch, revocation, outages, false isolation, failed update and recovery; measure latency | Reproducible results and known limitations |
| 8. Final validation | Month 7–8 | Finish dashboard, installation guide, documentation, evaluation and demo | Integrated prototype ready for final viva |

Phases can overlap according to team progress and hardware availability.

## Four-member team division
1. Hardware/Firmware: ESP32-S3, ESP-IDF, Secure Boot, signed OTA, sensor and identity reporting.
2. Blockchain: Solidity contract, local EVM, approval/revocation, on-chain event checks.
3. Backend/Networking: FastAPI, verification decisions, gateway policy, offline behavior.
4. Frontend/Testing: dashboard, integration tests, test matrix, metrics and final documentation.

All members participate in integration, debugging, and final testing.

## Evaluation matrix
- Approved firmware: device remains connected.
- Unknown/mismatched firmware: flag suspicious and alert; do not automatically treat every uncertainty as a confirmed compromise.
- Revoked release: confirmed violation and isolation according to policy.
- Explicit confirmed violation: isolation request is generated.
- Internet/EVM outage: cached local policy remains available.
- Failed OTA: verify rollback/recovery procedure.
- Recovery: reconnect only when approved firmware, Secure Boot evidence, and signed-image checks pass.
- Measure: verification latency, isolation latency, false-isolation rate, recovery success rate, and blockchain transaction latency/gas.

## Required production-hardening work
Authentication and authorization for every API, TLS certificates, secure device provisioning, signed policy snapshots, rate limiting, audit-log anchoring, secrets management, robust IP/MAC identity mapping, firewall rollback and emergency access, and threat-model review.
