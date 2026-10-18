import hashlib, json
from sqlalchemy import select
from app.models import AuditEntry

GENESIS = "0" * 64

def append_audit(db, event_type: str, payload: dict):
    previous = db.scalar(select(AuditEntry).order_by(AuditEntry.id.desc()).limit(1))
    prev_hash = previous.entry_hash if previous else GENESIS
    payload_json = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    material = f"{prev_hash}|{event_type}|{payload_json}"
    entry_hash = hashlib.sha256(material.encode("utf-8")).hexdigest()
    row = AuditEntry(event_type=event_type, payload_json=payload_json,
                     previous_hash=prev_hash, entry_hash=entry_hash)
    db.add(row)
    db.flush()
    return row

def verify_audit_chain(entries):
    previous = GENESIS
    for row in entries:
        if row.previous_hash != previous:
            return False
        material = f"{previous}|{row.event_type}|{row.payload_json}"
        if hashlib.sha256(material.encode("utf-8")).hexdigest() != row.entry_hash:
            return False
        previous = row.entry_hash
    return True
