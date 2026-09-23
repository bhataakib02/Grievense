import os
import json
import asyncio
import logging
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

from app.config import (
    CHAIN_ID,
    NETWORK_NAME,
    CONTRACT_ADDRESSES,
    DEPLOYMENT_VERSION,
    SUPABASE_URL,
)
from app.services.ipfs_service import (
    upload_file_to_pinata,
    upload_json_to_pinata,
    get_pinata_gateway,
    verify_ipfs_content_hash,
)
from app.services.indexer_service import indexer
from app.services.reconciliation_service import reconciler
from app.db.supabase import (
    is_supabase_configured,
    is_supabase_online,
    get_indexed_grievances,
    get_indexed_departments,
    get_indexed_categories,
    get_indexer_checkpoint,
)

logger = logging.getLogger("grievance.backend")
logging.basicConfig(level=logging.INFO)

background_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize deployment and start background indexer
    logger.info("Initializing blockchain indexer and deployment registry...")
    try:
        indexer.initialize()
        # Perform initial sync pass
        indexer.sync_once()
    except Exception as exc:
        logger.warning(f"Initial blockchain sync warning: {exc}")

    # Launch background indexer task
    global background_task
    background_task = asyncio.create_task(indexer.start_background_loop(poll_interval=20))
    yield
    # Shutdown
    if background_task:
        indexer.running = False
        background_task.cancel()


app = FastAPI(
    title="Public Grievance System — Backend Service",
    description="Secure server-side IPFS pinning, off-chain indexing, blockchain event cache, and reconciliation.",
    version="2.1.0",
    lifespan=lifespan,
)

# Configure CORS
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


# =============================================================================
# HEALTH & STATUS ENDPOINTS
# =============================================================================

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "grievance-backend-indexer",
        "chainId": CHAIN_ID,
        "network": NETWORK_NAME,
        "deploymentVersion": DEPLOYMENT_VERSION,
        "supabase": {
            "configured": is_supabase_configured(),
            "online": is_supabase_online(),
        },
        "indexer": {
            "connected": indexer.w3.is_connected(),
            "activeDeploymentId": indexer.deployment["id"] if indexer.deployment else None,
        },
    }


@app.get("/api/ipfs/status")
async def ipfs_status():
    """Returns non-sensitive status of Pinata configuration."""
    jwt_configured = bool(os.getenv("PINATA_JWT", "").strip())
    return {
        "configured": jwt_configured,
        "gateway": get_pinata_gateway(),
        "provider": "Pinata IPFS",
    }


# =============================================================================
# IPFS UPLOAD & VERIFICATION ENDPOINTS
# =============================================================================

@app.post("/api/ipfs/upload")
async def upload_ipfs(
    request: Request,
    file: Optional[UploadFile] = File(None),
    content: Optional[str] = Form(None),
    filename: Optional[str] = Form(None),
):
    """
    Accepts multipart/form-data file upload or text/JSON payload.
    Pins to Pinata securely and returns the authoritative IPFS CID and keccak256 hash.
    """
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
                    "contentHash": result.get("contentHash"),
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
                    "contentHash": result.get("contentHash"),
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
                    "contentHash": result.get("contentHash"),
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
        detail="No file or content provided.",
    )


@app.get("/api/ipfs/verify/{cid}")
async def verify_ipfs(cid: str, expected_hash: str = Query(..., description="On-chain bytes32 keccak256 hash")):
    """
    Cryptographically verifies IPFS document content against the expected on-chain hash.
    """
    res = await verify_ipfs_content_hash(cid=cid, expected_hash=expected_hash)
    return res


# =============================================================================
# INDEXER & RECONCILIATION ENDPOINTS
# =============================================================================

@app.get("/api/indexer/status")
async def indexer_status():
    """Returns real-time sync checkpoints and latest Sepolia chain block."""
    dep_id = indexer.deployment["id"] if indexer.deployment else None
    latest_block = indexer.get_latest_block()
    return {
        "connected": indexer.w3.is_connected(),
        "deploymentId": dep_id,
        "latestChainBlock": latest_block,
        "grievanceCheckpoint": get_indexer_checkpoint(dep_id, CONTRACT_ADDRESSES["GrievanceSystem"]) if dep_id else 0,
        "departmentCheckpoint": get_indexer_checkpoint(dep_id, CONTRACT_ADDRESSES["DepartmentManager"]) if dep_id else 0,
        "auditCheckpoint": get_indexer_checkpoint(dep_id, CONTRACT_ADDRESSES["AuditTrail"]) if dep_id else 0,
        "isRunning": indexer.running,
    }


@app.post("/api/reconcile")
async def trigger_reconciliation():
    """
    Admin reconciliation trigger: compares on-chain records with Supabase cache,
    repairs discrepancies, and returns audit report.
    """
    report = reconciler.reconcile()
    return report


# =============================================================================
# FAST OFF-CHAIN READ CACHE ENDPOINTS (VERIFIED READ STRATEGY)
# =============================================================================

@app.get("/api/cached/grievances")
async def cached_grievances(
    citizen: Optional[str] = None,
    department: Optional[int] = None,
    officer: Optional[str] = None,
    status: Optional[int] = None,
    limit: int = 100,
):
    """
    Returns indexed grievances for active deployment.
    Frontend uses this for fast search/filtering, then verifies critical state on-chain.
    """
    if not indexer.deployment:
        indexer.initialize()
    dep_id = indexer.deployment["id"] if indexer.deployment else 1
    items = get_indexed_grievances(
        deployment_id=dep_id,
        citizen_address=citizen,
        department_id=department,
        assigned_officer=officer,
        status=status,
        limit=limit,
    )
    return {
        "success": True,
        "deploymentId": dep_id,
        "count": len(items),
        "grievances": items,
    }


@app.get("/api/cached/departments")
async def cached_departments():
    if not indexer.deployment:
        indexer.initialize()
    dep_id = indexer.deployment["id"] if indexer.deployment else 1
    items = get_indexed_departments(deployment_id=dep_id)
    return {
        "success": True,
        "deploymentId": dep_id,
        "count": len(items),
        "departments": items,
    }


@app.get("/api/cached/categories")
async def cached_categories(department_id: Optional[int] = None):
    if not indexer.deployment:
        indexer.initialize()
    dep_id = indexer.deployment["id"] if indexer.deployment else 1
    items = get_indexed_categories(deployment_id=dep_id, department_id=department_id)
    return {
        "success": True,
        "deploymentId": dep_id,
        "count": len(items),
        "categories": items,
    }
