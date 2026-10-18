"""Conservative nftables adapter. Default project mode is simulation.
Never use this on a network you do not own/administer. Review rules before enabling.
"""
import os
import subprocess
from app.config import ALLOW_FIREWALL_CHANGES

def isolate_device(ip_address: str, device_id: str):
    # Prototype guard: explicit environment opt-in required.
    if not ALLOW_FIREWALL_CHANGES:
        return {"mode": "simulation", "applied": False,
                "message": "Firewall changes disabled. Set ALLOW_FIREWALL_CHANGES=true only in an isolated lab."}
    # Avoid shell=True and reject suspicious characters; real deployments should use a managed nftables set.
    import ipaddress
    ip = str(ipaddress.ip_address(ip_address))
    if os.name != "posix":
        return {"mode": "nftables", "applied": False, "message": "nftables requires Linux."}
    # Deliberately does not install a full ruleset. Administrator must pre-create this set.
    result = subprocess.run(
        ["nft", "add", "element", "inet", "firmachain", "isolated_ipv4", "{", ip, "}"],
        capture_output=True, text=True, timeout=5
    )
    return {"mode": "nftables", "applied": result.returncode == 0,
            "message": result.stderr.strip() or result.stdout.strip() or "Command completed"}
