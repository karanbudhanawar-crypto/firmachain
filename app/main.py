import json, time, uuid, hashlib, csv, io
from datetime import datetime, timezone
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from app.db import Base, engine, get_db, SessionLocal
from app.models import Device, Release, Incident, AuditEntry
from app.schemas import DeviceRegistration, DeviceReport, ReleaseCreate, RecoveryCheck
from app.audit import append_audit, verify_audit_chain
from app.config import GATEWAY_MODE
from gateway.policy_cache import save_policy, load_policy
from gateway.nftables_adapter import isolate_device

DEMO_HASH = hashlib.sha256(b"firmachain-demo-approved-firmware-v1").hexdigest()
app = FastAPI(title="FirmaChain API", version="0.1.0",
              description="Firmware integrity monitoring for ESP32-S3 devices with release verification and audit logging.")
app.mount("/static", StaticFiles(directory="static"), name="static")

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if not db.get(Release, "release-1.0.0"):
            db.add(Release(id="release-1.0.0", version="1.0.0", sha256=DEMO_HASH,
                           approved=True, revoked=False, notes="Initial registry release record"))
            append_audit(db, "release_approved", {"release_id": "release-1.0.0", "version": "1.0.0", "sha256": DEMO_HASH})
            db.commit()
        save_policy({"mode": "cached", "allowed_hashes": [DEMO_HASH], "isolated_devices": []})
    finally:
        db.close()

@app.on_event("startup")
def startup():
    seed()

@app.get("/", response_class=HTMLResponse)
def dashboard():
    with open("static/index.html", encoding="utf-8") as f:
        return f.read()

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "FirmaChain API", "gateway_mode": GATEWAY_MODE}



@app.get("/api/export/security-report.csv")
def export_security_report(db: Session = Depends(get_db)):
    """Download a real CSV snapshot of current devices, releases, incidents, and audit verification."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["section", "id", "timestamp", "name_or_type", "status_or_decision", "details_or_hash"])
    for d in db.scalars(select(Device).order_by(Device.id)).all():
        writer.writerow(["device", d.id, d.last_seen.isoformat() if d.last_seen else "",
                         d.name, f"{d.status}/{d.network_state}/{d.last_decision}",
                         f"firmware={d.firmware_version}; sha256={d.reported_hash}"])
    for r in db.scalars(select(Release).order_by(Release.created_at.desc())).all():
        writer.writerow(["release", r.id, r.created_at.isoformat() if r.created_at else "",
                         r.version, "revoked" if r.revoked else "approved" if r.approved else "pending",
                         r.sha256])
    for incident in db.scalars(select(Incident).order_by(Incident.id.desc()).limit(500)).all():
        writer.writerow(["incident", incident.device_id, incident.created_at.isoformat() if incident.created_at else "",
                         incident.event_type, incident.severity, incident.details])
    entries = db.scalars(select(AuditEntry).order_by(AuditEntry.id).limit(5000)).all()
    writer.writerow(["audit_summary", "", datetime.now(timezone.utc).isoformat(), "hash_chain",
                     "valid" if verify_audit_chain(entries) else "invalid", f"{len(entries)} entries"])
    for entry in entries:
        writer.writerow(["audit", entry.id, entry.created_at.isoformat() if entry.created_at else "",
                         entry.event_type, entry.entry_hash, entry.payload_json])
    return Response(content=output.getvalue(), media_type="text/csv; charset=utf-8",
                     headers={"Content-Disposition": "attachment; filename=firmachain-security-report.csv"})

@app.get("/api/hardware/status")
def hardware_status(db: Session = Depends(get_db)):
    """Report whether the expected physical ESP32-S3 has sent a recent USB-bridge report."""
    device_id = "esp32-s3-usb-01"
    device = db.get(Device, device_id)
    now = datetime.now(timezone.utc)
    if not device or not device.last_seen:
        return {"connected": False, "device_id": device_id, "transport": "USB serial via host bridge",
                "last_seen": None, "seconds_since_report": None, "device": None}
    last_seen = device.last_seen
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    age = max(0, int((now - last_seen).total_seconds()))
    online = age <= 45
    return {"connected": online, "device_id": device_id, "transport": "USB serial via host bridge",
            "last_seen": device.last_seen.isoformat(), "seconds_since_report": age,
            "device": device_json(device)}

@app.get("/api/devices")
def devices(db: Session = Depends(get_db)):
    rows = db.scalars(select(Device).order_by(Device.id)).all()
    return [device_json(d) for d in rows]

def device_json(d):
    return {"id": d.id, "name": d.name, "firmware_version": d.firmware_version,
            "reported_hash": d.reported_hash, "status": d.status,
            "network_state": d.network_state, "last_decision": d.last_decision,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None}

@app.post("/api/devices/register")
def register_device(body: DeviceRegistration, db: Session = Depends(get_db)):
    device = db.get(Device, body.device_id)
    if not device:
        device = Device(id=body.device_id, name=body.name)
        db.add(device)
    device.name = body.name
    device.firmware_version = body.firmware_version
    device.reported_hash = body.firmware_hash.lower()
    device.status = "registered"
    device.last_seen = datetime.now(timezone.utc)
    append_audit(db, "device_registered", {"device_id": body.device_id, "firmware_version": body.firmware_version})
    db.commit()
    return {"ok": True, "device": device_json(device)}

@app.get("/api/releases")
def releases(db: Session = Depends(get_db)):
    rows = db.scalars(select(Release).order_by(Release.created_at.desc())).all()
    return [{"id": r.id, "version": r.version, "sha256": r.sha256,
             "approved": r.approved, "revoked": r.revoked, "notes": r.notes} for r in rows]

@app.post("/api/releases")
def create_release(body: ReleaseCreate, db: Session = Depends(get_db)):
    if db.get(Release, body.release_id):
        raise HTTPException(409, "Release ID already exists")
    row = Release(id=body.release_id, version=body.version, sha256=body.sha256.lower(),
                  approved=True, revoked=False, notes=body.notes)
    db.add(row)
    append_audit(db, "release_approved", {"release_id": body.release_id, "version": body.version, "sha256": body.sha256.lower()})
    db.commit()
    refresh_policy(db)
    return {"ok": True, "release_id": row.id}

@app.post("/api/releases/{release_id}/revoke")
def revoke_release(release_id: str, db: Session = Depends(get_db)):
    row = db.get(Release, release_id)
    if not row:
        raise HTTPException(404, "Release not found")
    row.revoked = True
    append_audit(db, "release_revoked", {"release_id": row.id, "sha256": row.sha256})
    db.commit()
    refresh_policy(db)
    return {"ok": True, "release_id": row.id, "revoked": True}

def refresh_policy(db):
    approved = db.scalars(select(Release).where(Release.approved == True, Release.revoked == False)).all()
    cache = load_policy()
    save_policy({"mode": "cached", "updated_at": datetime.now(timezone.utc).isoformat(),
                 "allowed_hashes": [r.sha256 for r in approved],
                 "isolated_devices": cache.get("isolated_devices", [])})

@app.post("/api/reports")
def report(body: DeviceReport, db: Session = Depends(get_db)):
    started = time.perf_counter()
    device = db.get(Device, body.device_id)
    if not device:
        device = Device(id=body.device_id, name=body.device_id)
        db.add(device)
    device.firmware_version = body.firmware_version
    device.reported_hash = body.firmware_hash.lower()
    device.last_seen = datetime.now(timezone.utc)

    releases = db.scalars(select(Release).where(Release.sha256 == body.firmware_hash.lower())).all()
    approved = any(r.approved and not r.revoked for r in releases)
    revoked = any(r.revoked for r in releases)
    if body.security_violation or revoked:
        decision, status, severity = "isolate", "isolated", "high"
        event_type = "confirmed_violation"
        device.network_state = "isolated"
        device.status = "violation"
        device.last_decision = decision
        incident = Incident(device_id=device.id, severity=severity, event_type=event_type,
                            details=body.note or ("Firmware release is revoked" if revoked else "Device reported a security violation"))
        db.add(incident)
        gateway_result = {"mode": "simulation", "applied": False, "message": "Gateway isolation simulated; no firewall rules changed."}
        # The demo does not assume device IPs. Real gateway integration must map authenticated device identity to an IP/MAC safely.
        append_audit(db, "device_isolated", {"device_id": device.id, "reason": incident.details})
    elif approved:
        decision, status = "allow", "approved"
        device.network_state = "connected"
        device.status = status
        device.last_decision = decision
        gateway_result = {"mode": "simulation", "applied": False, "message": "Device allowed in prototype policy; no firewall rules changed."}
        append_audit(db, "firmware_approved_report", {"device_id": device.id, "version": body.firmware_version, "sha256": body.firmware_hash.lower()})
    else:
        decision, status = "investigate", "suspicious"
        device.status = status
        device.last_decision = decision
        incident = Incident(device_id=device.id, severity="medium", event_type="firmware_mismatch",
                            details=body.note or "Firmware hash does not match an approved release")
        db.add(incident)
        gateway_result = {"mode": "simulation", "applied": False, "message": "Suspicious device flagged for investigation; no firewall rules changed."}
        append_audit(db, "firmware_mismatch", {"device_id": device.id, "sha256": body.firmware_hash.lower()})
    db.commit()
    elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
    return {"device_id": device.id, "decision": decision, "status": device.status,
            "network_state": device.network_state, "gateway": gateway_result,
            "verification_latency_ms": elapsed_ms}

@app.get("/api/incidents")
def incidents(db: Session = Depends(get_db)):
    rows = db.scalars(select(Incident).order_by(Incident.id.desc()).limit(100)).all()
    return [{"id": x.id, "device_id": x.device_id, "severity": x.severity,
             "event_type": x.event_type, "details": x.details,
             "created_at": x.created_at.isoformat() if x.created_at else None} for x in rows]

@app.get("/api/audit")
def audit(db: Session = Depends(get_db)):
    rows = db.scalars(select(AuditEntry).order_by(AuditEntry.id).limit(500)).all()
    valid = verify_audit_chain(rows)
    return {"chain_valid": valid, "count": len(rows),
            "entries": [{"id": x.id, "event_type": x.event_type, "payload": json.loads(x.payload_json),
                         "previous_hash": x.previous_hash, "entry_hash": x.entry_hash,
                         "created_at": x.created_at.isoformat() if x.created_at else None} for x in rows]}

@app.post("/api/devices/{device_id}/recovery-check")
def recovery_check(device_id: str, body: RecoveryCheck, db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    releases = db.scalars(select(Release).where(Release.sha256 == body.firmware_hash.lower())).all()
    approved = any(r.approved and not r.revoked for r in releases)
    passed = approved and body.secure_boot_ok and body.signed_image_ok
    append_audit(db, "recovery_check", {"device_id": device_id, "approved_hash": approved,
                                       "secure_boot_ok": body.secure_boot_ok,
                                       "signed_image_ok": body.signed_image_ok, "passed": passed})
    device.last_decision = "recovery_passed" if passed else "recovery_failed"
    if passed:
        device.reported_hash = body.firmware_hash.lower()
        device.status = "recovery_ready"
    db.commit()
    return {"device_id": device_id, "passed": passed,
            "checks": {"approved_firmware": approved, "secure_boot_ok": body.secure_boot_ok,
                       "signed_image_ok": body.signed_image_ok},
            "message": "Recovery conditions passed" if passed else "Keep isolated; all checks must pass"}

@app.post("/api/devices/{device_id}/reconnect")
def reconnect(device_id: str, db: Session = Depends(get_db)):
    device = db.get(Device, device_id)
    if not device:
        raise HTTPException(404, "Device not found")
    if device.last_decision != "recovery_passed" or device.status != "recovery_ready":
        raise HTTPException(409, "Recovery checks have not passed")
    device.network_state = "connected"
    device.status = "approved"
    device.last_decision = "allow_after_recovery"
    append_audit(db, "device_reconnected", {"device_id": device_id})
    db.commit()
    return {"ok": True, "device": device_json(device)}

@app.get("/api/metrics")
def metrics(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count()).select_from(Device)) or 0
    isolated = db.scalar(select(func.count()).select_from(Device).where(Device.network_state == "isolated")) or 0
    suspicious = db.scalar(select(func.count()).select_from(Device).where(Device.status == "suspicious")) or 0
    incident_count = db.scalar(select(func.count()).select_from(Incident)) or 0
    return {"devices": total, "isolated_devices": isolated, "suspicious_devices": suspicious,
            "incidents": incident_count, "gateway_mode": GATEWAY_MODE,
            "audit_chain_valid": verify_audit_chain(db.scalars(select(AuditEntry).order_by(AuditEntry.id)).all())}
