from pydantic import BaseModel, Field
from typing import Optional

class DeviceRegistration(BaseModel):
    device_id: str = Field(min_length=2, max_length=80)
    name: str = Field(default="ESP32-S3 demo device", max_length=160)
    firmware_version: str = Field(default="1.0.0", max_length=80)
    firmware_hash: str = Field(min_length=64, max_length=64, pattern=r"^[a-fA-F0-9]{64}$")

class DeviceReport(BaseModel):
    device_id: str
    firmware_version: str
    firmware_hash: str = Field(min_length=64, max_length=64, pattern=r"^[a-fA-F0-9]{64}$")
    security_violation: bool = False
    note: Optional[str] = None

class ReleaseCreate(BaseModel):
    release_id: str = Field(min_length=2, max_length=80)
    version: str = Field(max_length=80)
    sha256: str = Field(min_length=64, max_length=64, pattern=r"^[a-fA-F0-9]{64}$")
    notes: str = ""

class RecoveryCheck(BaseModel):
    firmware_hash: str = Field(min_length=64, max_length=64, pattern=r"^[a-fA-F0-9]{64}$")
    secure_boot_ok: bool = False
    signed_image_ok: bool = False
