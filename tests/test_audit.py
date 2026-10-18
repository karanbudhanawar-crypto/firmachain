from types import SimpleNamespace
from app.audit import verify_audit_chain, GENESIS
import hashlib

def make_entry(prev, event, payload):
    material = f"{prev}|{event}|{payload}"
    return SimpleNamespace(previous_hash=prev, event_type=event, payload_json=payload,
                           entry_hash=hashlib.sha256(material.encode()).hexdigest())

def test_valid_chain():
    import json
    payload = json.dumps({"a":1}, sort_keys=True, separators=(",",":"))
    one = make_entry(GENESIS, "first", payload)
    payload2 = json.dumps({"b":2}, sort_keys=True, separators=(",",":"))
    two = make_entry(one.entry_hash, "second", payload2)
    assert verify_audit_chain([one, two])

def test_tampered_chain_fails():
    import json
    payload = json.dumps({"a":1}, sort_keys=True, separators=(",",":"))
    one = make_entry(GENESIS, "first", payload)
    tampered = SimpleNamespace(previous_hash=one.previous_hash, event_type=one.event_type,
                               payload_json='{"a":2}', entry_hash=one.entry_hash)
    assert not verify_audit_chain([tampered])
