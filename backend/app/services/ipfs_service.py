import os
import io
import json
from typing import Optional, Dict, Any
import httpx
from dotenv import load_dotenv

# Load environment variables from backend/.env if available
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

PINATA_BASE_URL = "https://api.pinata.cloud/pinning"
DEFAULT_GATEWAY = "https://gateway.pinata.cloud"


def get_pinata_jwt() -> str:
    """
    Retrieves the Pinata JWT from environment variables.
    Fails clearly if not configured.
    """
    jwt = os.getenv("PINATA_JWT", "").strip()
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
    return os.getenv("PINATA_GATEWAY", DEFAULT_GATEWAY).rstrip("/")


async def upload_file_to_pinata(
    file_bytes: bytes,
    filename: str = "file.bin",
    content_type: str = "application/octet-stream",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Uploads raw file bytes to IPFS via Pinata authenticated API.
    Preserves original filename and MIME type.
    Never logs or exposes the Pinata JWT.
    """
    jwt = get_pinata_jwt()
    gateway = get_pinata_gateway()

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
            # Clean error without leaking credentials
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

    return {
        "success": True,
        "cid": cid,
        "ipfsUri": f"ipfs://{cid}",
        "gatewayUrl": f"{gateway}/ipfs/{cid}",
        "pinSize": res_data.get("PinSize", len(file_bytes)),
        "timestamp": res_data.get("Timestamp"),
    }


async def upload_json_to_pinata(
    payload: Any,
    name: str = "metadata.json",
) -> Dict[str, Any]:
    """
    Uploads a JSON-serializable object or text string to IPFS via Pinata.
    Uses pinFileToIPFS with application/json to maintain consistent raw/JSON IPFS storage.
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
