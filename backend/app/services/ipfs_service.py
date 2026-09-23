import os
import io
import json
from typing import Optional, Dict, Any
import httpx
from web3 import Web3
from dotenv import load_dotenv

from app.config import PINATA_JWT, PINATA_GATEWAY
from app.db.supabase import upsert_ipfs_object

PINATA_BASE_URL = "https://api.pinata.cloud/pinning"
DEFAULT_GATEWAY = "https://gateway.pinata.cloud"


def get_pinata_jwt() -> str:
    """
    Retrieves the Pinata JWT from environment variables.
    Fails clearly if not configured.
    """
    jwt = PINATA_JWT
    if not jwt:
        raise ValueError(
            "PINATA_JWT is not configured in backend environment. "
            "Please set PINATA_JWT in backend/.env to enable server-side IPFS pinning."
        )
    return jwt


def get_pinata_gateway() -> str:
    """
    Retrieves the configured Pinata gateway base URL.
    """
    return PINATA_GATEWAY or DEFAULT_GATEWAY


def compute_content_hash(content_bytes: bytes) -> str:
    """
    Computes deterministic keccak256 hash matching Solidity descriptionHash/contentHash.
    """
    keccak_hex = Web3.keccak(content_bytes).hex()
    return keccak_hex if keccak_hex.startswith("0x") else f"0x{keccak_hex}"


async def upload_file_to_pinata(
    file_bytes: bytes,
    filename: str = "file.bin",
    content_type: str = "application/octet-stream",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Uploads raw file bytes to IPFS via Pinata authenticated API.
    Preserves original filename and MIME type.
    Computes cryptographic contentHash and persists record to ipfs_objects.
    """
    jwt = get_pinata_jwt()
    gateway = get_pinata_gateway()
    content_hash = compute_content_hash(file_bytes)

    url = f"{PINATA_BASE_URL}/pinFileToIPFS"
    headers = {
        "Authorization": f"Bearer {jwt}",
    }

    files = {
        "file": (filename, file_bytes, content_type)
    }

    data = {}
    if metadata:
        data["pinataMetadata"] = json.dumps(metadata)

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, headers=headers, files=files, data=data)
        except httpx.RequestError as exc:
            raise RuntimeError(f"Network error communicating with Pinata IPFS service: {str(exc)}")

    if response.status_code != 200:
        error_detail = "Pinata upload failed"
        try:
            res_json = response.json()
            if "error" in res_json:
                error_detail = res_json.get("error", {}).get("details", error_detail)
        except Exception:
            error_detail = f"Pinata returned HTTP {response.status_code}"
        raise RuntimeError(f"Pinata IPFS error: {error_detail}")

    res_data = response.json()
    cid = res_data.get("IpfsHash")
    if not cid:
        raise RuntimeError("Pinata response missing IpfsHash CID.")

    gateway_url = f"{gateway}/ipfs/{cid}"

    # Index into ipfs_objects
    upsert_ipfs_object({
        "cid": cid,
        "content_hash": content_hash,
        "mime_type": content_type,
        "file_size_bytes": len(file_bytes),
        "pinned_by": None,
        "provider": "Pinata",
        "gateway_url": gateway_url,
        "is_persisted": True,
    })

    return {
        "success": True,
        "cid": cid,
        "contentHash": content_hash,
        "ipfsUri": f"ipfs://{cid}",
        "gatewayUrl": gateway_url,
        "pinSize": res_data.get("PinSize", len(file_bytes)),
        "timestamp": res_data.get("Timestamp"),
    }


async def upload_json_to_pinata(
    payload: Any,
    name: str = "metadata.json",
) -> Dict[str, Any]:
    """
    Uploads a JSON-serializable object or text string to IPFS via Pinata.
    """
    if isinstance(payload, str):
        json_bytes = payload.encode("utf-8")
    else:
        json_bytes = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    return await upload_file_to_pinata(
        file_bytes=json_bytes,
        filename=name,
        content_type="application/json",
        metadata={"name": name},
    )


async def verify_ipfs_content_hash(
    cid: str,
    expected_hash: str,
    custom_gateway: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetches IPFS content, recomputes keccak256 hash, and performs cryptographic verification.
    """
    if not cid:
        return {"verified": False, "error": "Missing CID"}

    gateways = []
    if custom_gateway:
        gateways.append(f"{custom_gateway.rstrip('/')}/ipfs/{cid}")
    gateways.append(f"{get_pinata_gateway()}/ipfs/{cid}")
    gateways.append(f"https://ipfs.io/ipfs/{cid}")
    gateways.append(f"https://dweb.link/ipfs/{cid}")

    content_bytes = None
    resolved_url = None

    async with httpx.AsyncClient(timeout=10.0) as client:
        for gw in gateways:
            try:
                res = await client.get(gw)
                if res.status_code == 200:
                    content_bytes = res.content
                    resolved_url = gw
                    break
            except Exception:
                continue

    if content_bytes is None:
        return {
            "verified": False,
            "cid": cid,
            "expectedHash": expected_hash,
            "error": "Could not retrieve document from IPFS gateways."
        }

    computed_hash = compute_content_hash(content_bytes)
    exp_clean = expected_hash.lower() if expected_hash.startswith("0x") else f"0x{expected_hash.lower()}"
    comp_clean = computed_hash.lower()

    matches = (exp_clean == comp_clean)
    return {
        "verified": matches,
        "cid": cid,
        "computedHash": comp_clean,
        "expectedHash": exp_clean,
        "gatewayUrl": resolved_url,
        "sizeBytes": len(content_bytes),
        "status": "VERIFIED" if matches else "INTEGRITY_MISMATCH",
    }
