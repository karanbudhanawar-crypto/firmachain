from fastapi.testclient import TestClient
from app.main import app, DEMO_HASH


def test_api_workflow():
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        approved = client.post("/api/reports", json={
            "device_id":"test-device-approved", "firmware_version":"1.0.0",
            "firmware_hash":DEMO_HASH, "security_violation":False, "note":"test"
        })
        assert approved.status_code == 200
        assert approved.json()["decision"] == "allow"
        mismatch = client.post("/api/reports", json={
            "device_id":"test-device-mismatch", "firmware_version":"0.0.0",
            "firmware_hash":"a"*64, "security_violation":False, "note":"test mismatch"
        })
        assert mismatch.status_code == 200
        assert mismatch.json()["decision"] == "investigate"
