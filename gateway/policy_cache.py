"""Minimal local policy cache for offline decision continuity.
Production systems should persist and sign policy snapshots and define expiry/revocation semantics.
"""
import json
from pathlib import Path

CACHE_PATH = Path("gateway_policy_cache.json")

def save_policy(policy: dict):
    CACHE_PATH.write_text(json.dumps(policy, indent=2), encoding="utf-8")

def load_policy():
    if not CACHE_PATH.exists():
        return {"mode": "no_cache", "allowed_hashes": [], "isolated_devices": []}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"mode": "cache_invalid", "allowed_hashes": [], "isolated_devices": []}
