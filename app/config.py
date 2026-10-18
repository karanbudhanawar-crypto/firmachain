import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./firmachain.db")
GATEWAY_MODE = os.getenv("GATEWAY_MODE", "simulation").lower()
ALLOW_FIREWALL_CHANGES = os.getenv("ALLOW_FIREWALL_CHANGES", "false").lower() == "true"
