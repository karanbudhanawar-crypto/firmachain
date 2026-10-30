import hashlib
import uuid

from fastapi.testclient import TestClient
from app.main import app, DEMO_HASH
from app import main as main_module


def test_api_workflow():
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        approved = client.post("/api/reports", json={
            "device_id": "test-device-approved", "firmware_version": "1.0.0",
            "firmware_hash": DEMO_HASH, "security_violation": False, "note": "test"
        })
        assert approved.status_code == 200
        assert approved.json()["decision"] == "allow"

        mismatch_id = "test-device-mismatch-" + uuid.uuid4().hex
        mismatch_payload = {
            "device_id": mismatch_id, "firmware_version": "0.0.0",
            "firmware_hash": "a" * 64, "security_violation": False, "note": "test mismatch"
        }
        mismatch = client.post("/api/reports", json=mismatch_payload)
        assert mismatch.status_code == 200
        assert mismatch.json()["decision"] == "investigate"
        assert mismatch.json()["alert_suppressed"] is False

        incidents_after_first = [
            item for item in client.get("/api/incidents").json()
            if item["device_id"] == mismatch_id and item["event_type"] == "firmware_mismatch"
        ]
        assert len(incidents_after_first) == 1

        repeated = client.post("/api/reports", json=mismatch_payload)
        assert repeated.status_code == 200
        assert repeated.json()["decision"] == "investigate"
        assert repeated.json()["alert_suppressed"] is True

        incidents_after_repeat = [
            item for item in client.get("/api/incidents").json()
            if item["device_id"] == mismatch_id and item["event_type"] == "firmware_mismatch"
        ]
        assert len(incidents_after_repeat) == 1


def test_release_mutations_require_admin_token(monkeypatch):
    monkeypatch.setattr(main_module, "FIRMWARE_ADMIN_TOKEN", "")
    release_id = "test-release-" + uuid.uuid4().hex
    payload = {
        "release_id": release_id,
        "version": "test",
        "sha256": hashlib.sha256(uuid.uuid4().bytes).hexdigest(),
        "notes": "Automated authorization test"
    }

    with TestClient(app) as client:
        disabled = client.post("/api/releases", json=payload)
        assert disabled.status_code == 503

        monkeypatch.setattr(main_module, "FIRMWARE_ADMIN_TOKEN", "test-admin-token")
        unauthorized = client.post("/api/releases", json=payload)
        assert unauthorized.status_code == 401

        created = client.post(
            "/api/releases",
            json=payload,
            headers={"Authorization": "Bearer test-admin-token"},
        )
        assert created.status_code == 200

        unauthorized_revoke = client.post(f"/api/releases/{release_id}/revoke")
        assert unauthorized_revoke.status_code == 401

        revoked = client.post(
            f"/api/releases/{release_id}/revoke",
            headers={"Authorization": "Bearer test-admin-token"},
        )
        assert revoked.status_code == 200
        assert revoked.json()["revoked"] is True
