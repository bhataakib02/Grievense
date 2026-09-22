import os
import json
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from app.services.ipfs_service import (
    upload_file_to_pinata,
    upload_json_to_pinata,
    get_pinata_gateway,
)

# Load environment
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI(
    title="Public Grievance System — Backend IPFS Service",
    description="Secure server-side IPFS pinning proxy integrating with Pinata without exposing credentials.",
    version="1.0.0",
)

# Configure CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB limit


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "grievance-ipfs-backend"}


@app.get("/api/ipfs/status")
async def ipfs_status():
    """
    Returns non-sensitive status of Pinata configuration.
    Never exposes the JWT or secret values.
    """
    jwt_configured = bool(os.getenv("PINATA_JWT", "").strip())
    return {
        "configured": jwt_configured,
        "gateway": get_pinata_gateway(),
        "provider": "Pinata IPFS",
    }


@app.post("/api/ipfs/upload")
async def upload_ipfs(
    request: Request,
    file: Optional[UploadFile] = File(None),
    content: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
):
    """
    Accepts multipart/form-data file upload or text/JSON payload.
    Pins to Pinata securely and returns the authoritative IPFS CID.
    """
    # 1. Handle file upload (multipart/form-data)
    if file is not None:
        file_bytes = await file.read()
        if len(file_bytes) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes).",
            )
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024 * 1024)}MB.",
            )

        try:
            result = await upload_file_to_pinata(
                file_bytes=file_bytes,
                filename=file.filename or "evidence.bin",
                content_type=file.content_type or "application/octet-stream",
            )
            return JSONResponse(
                content={
                    "success": True,
                    "cid": result["cid"],
                    "ipfsUri": result["ipfsUri"],
                    "gatewayUrl": result["gatewayUrl"],
                }
            )
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(val_err),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"IPFS upload failed: {str(exc)}",
            )

    # 2. Handle text / JSON form content
    if content is not None:
        if not content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Text content is empty.",
            )
        try:
            result = await upload_json_to_pinata(
                payload=content,
                name=filename or "grievance-description.json",
            )
            return JSONResponse(
                content={
                    "success": True,
                    "cid": result["cid"],
                    "ipfsUri": result["ipfsUri"],
                    "gatewayUrl": result["gatewayUrl"],
                }
            )
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(val_err),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"IPFS upload failed: {str(exc)}",
            )

    # 3. Check for JSON body if request is application/json
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            payload_str = json.dumps(body)
            result = await upload_json_to_pinata(
                payload=payload_str,
                name=filename or "data.json",
            )
            return JSONResponse(
                content={
                    "success": True,
                    "cid": result["cid"],
                    "ipfsUri": result["ipfsUri"],
                    "gatewayUrl": result["gatewayUrl"],
                }
            )
        except ValueError as val_err:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(val_err),
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"IPFS JSON upload failed: {str(exc)}",
            )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="No file or content provided. Provide a multipart file or content payload.",
    )
