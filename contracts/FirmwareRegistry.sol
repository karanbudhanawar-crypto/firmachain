// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title FirmwareRegistry
/// @notice Minimal local-EVM prototype for approved and revoked firmware releases.
/// @dev Production use needs role-based access control, event monitoring, tests, and deployment review.
contract FirmwareRegistry {
    address public owner;
    struct Release {
        string version;
        bytes32 firmwareHash;
        bool approved;
        bool revoked;
        uint64 createdAt;
    }
    mapping(bytes32 => Release) private releases;
    event ReleaseApproved(bytes32 indexed releaseId, string version, bytes32 firmwareHash);
    event ReleaseRevoked(bytes32 indexed releaseId, bytes32 firmwareHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }
    constructor() { owner = msg.sender; }

    function approveRelease(bytes32 releaseId, string calldata version, bytes32 firmwareHash) external onlyOwner {
        require(releaseId != bytes32(0), "empty release id");
        require(firmwareHash != bytes32(0), "empty hash");
        Release storage r = releases[releaseId];
        require(!r.approved, "already approved");
        r.version = version;
        r.firmwareHash = firmwareHash;
        r.approved = true;
        r.revoked = false;
        r.createdAt = uint64(block.timestamp);
        emit ReleaseApproved(releaseId, version, firmwareHash);
    }
    function revokeRelease(bytes32 releaseId) external onlyOwner {
        Release storage r = releases[releaseId];
        require(r.approved, "unknown release");
        require(!r.revoked, "already revoked");
        r.revoked = true;
        emit ReleaseRevoked(releaseId, r.firmwareHash);
    }
    function isApproved(bytes32 firmwareHash) external view returns (bool) {
        // A release is trusted only when approved and not revoked.
        // This loop-free mapping design is keyed by release ID, so callers should use getRelease.
        firmwareHash;
        return false;
    }
    function getRelease(bytes32 releaseId) external view returns (string memory, bytes32, bool, bool, uint64) {
        Release memory r = releases[releaseId];
        return (r.version, r.firmwareHash, r.approved, r.revoked, r.createdAt);
    }
}
