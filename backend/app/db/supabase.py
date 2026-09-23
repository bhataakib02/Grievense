import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from app.config import (
    SUPABASE_URL,
    SUPABASE_KEY,
    CHAIN_ID,
    NETWORK_NAME,
    DEPLOYMENT_VERSION,
    CONTRACT_ADDRESSES,
)

logger = logging.getLogger("grievance.db")

_supabase_client = None
_client_initialized = False

# Resilient fallback store for local development when Supabase credentials are not supplied
# or if Supabase is temporarily unreachable.
_fallback_store: Dict[str, Any] = {
    "deployments": [],
    "departments": {},     # (deployment_id, dept_id) -> record
    "categories": {},      # (deployment_id, cat_id) -> record
    "officers": {},        # (deployment_id, dept_id, officer_address) -> record
    "grievances": {},      # (deployment_id, grievance_id) -> record
    "grievance_events": [], # list of records
    "audit_events": {},    # (deployment_id, audit_id) -> record
    "indexer_state": {},   # (deployment_id, contract_address) -> record
    "ipfs_objects": {},    # cid -> record
    "transactions": {},    # tx_hash -> record
}


def get_supabase_client():
    """
    Returns the initialized Supabase client if configured, or None.
    """
    global _supabase_client, _client_initialized
    if _client_initialized:
        return _supabase_client

    _client_initialized = True
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.info(
            "Supabase credentials not configured in backend environment. "
            "Running with resilient local in-memory fallback indexer store."
        )
        _supabase_client = None
        return None

    try:
        from supabase import create_client, Client
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("Successfully connected to Supabase PostgreSQL index.")
    except Exception as exc:
        logger.warning(
            f"Could not connect to Supabase: {exc}. Operating in offline index fallback mode."
        )
        _supabase_client = None

    return _supabase_client


def is_supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_KEY)


def is_supabase_online() -> bool:
    client = get_supabase_client()
    if not client:
        return False
    try:
        client.table("deployments").select("id").limit(1).execute()
        return True
    except Exception:
        return False


# =============================================================================
# DEPLOYMENT IDENTITY & REGISTRY
# =============================================================================

def get_or_create_deployment(
    chain_id: int = CHAIN_ID,
    network: str = NETWORK_NAME,
    version: str = DEPLOYMENT_VERSION,
    contracts: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Ensures the current deployment is recorded.
    Deterministic deployment identity based on (chain_id + 5 contract addresses).
    Never deletes or overwrites older deployments.
    """
    if contracts is None:
        contracts = CONTRACT_ADDRESSES

    role_mgr = contracts.get("RoleManager", "").lower()
    dept_mgr = contracts.get("DepartmentManager", "").lower()
    grievance = contracts.get("GrievanceSystem", "").lower()
    escalation = contracts.get("EscalationManager", "").lower()
    audit = contracts.get("AuditTrail", "").lower()

    client = get_supabase_client()
    if client:
        try:
            # Query existing deployment by contract addresses
            res = (
                client.table("deployments")
                .select("*")
                .eq("chain_id", chain_id)
                .ilike("role_manager", role_mgr)
                .ilike("department_manager", dept_mgr)
                .ilike("grievance_system", grievance)
                .ilike("escalation_manager", escalation)
                .ilike("audit_trail", audit)
                .execute()
            )
            if res.data and len(res.data) > 0:
                rec = res.data[0]
                # Ensure is_active is True
                if not rec.get("is_active"):
                    client.table("deployments").update({"is_active": True}).eq("id", rec["id"]).execute()
                    rec["is_active"] = True
                return rec

            # Mark all prior deployments as inactive (without deleting them!)
            client.table("deployments").update({"is_active": False}).eq("chain_id", chain_id).execute()

            # Insert new deployment
            new_dep = {
                "chain_id": chain_id,
                "network": network,
                "deployment_version": version,
                "role_manager": contracts.get("RoleManager"),
                "department_manager": contracts.get("DepartmentManager"),
                "grievance_system": contracts.get("GrievanceSystem"),
                "escalation_manager": contracts.get("EscalationManager"),
                "audit_trail": contracts.get("AuditTrail"),
                "is_active": True,
            }
            ins_res = client.table("deployments").insert(new_dep).execute()
            if ins_res.data:
                return ins_res.data[0]
        except Exception as exc:
            logger.warning(f"Error querying/creating deployment in Supabase: {exc}. Using fallback store.")

    # Fallback in-memory store
    for dep in _fallback_store["deployments"]:
        if (
            dep["chain_id"] == chain_id
            and dep["role_manager"].lower() == role_mgr
            and dep["department_manager"].lower() == dept_mgr
            and dep["grievance_system"].lower() == grievance
            and dep["escalation_manager"].lower() == escalation
            and dep["audit_trail"].lower() == audit
        ):
            dep["is_active"] = True
            return dep

    for dep in _fallback_store["deployments"]:
        if dep["chain_id"] == chain_id:
            dep["is_active"] = False

    new_id = len(_fallback_store["deployments"]) + 1
    new_dep = {
        "id": new_id,
        "chain_id": chain_id,
        "network": network,
        "deployment_version": version,
        "role_manager": contracts.get("RoleManager"),
        "department_manager": contracts.get("DepartmentManager"),
        "grievance_system": contracts.get("GrievanceSystem"),
        "escalation_manager": contracts.get("EscalationManager"),
        "audit_trail": contracts.get("AuditTrail"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _fallback_store["deployments"].append(new_dep)
    return new_dep


# =============================================================================
# INDEXER CHECKPOINT (RESTART SAFETY)
# =============================================================================

def get_indexer_checkpoint(deployment_id: int, contract_address: str) -> int:
    """
    Retrieves the last processed block number for a given contract.
    Returns 0 if no checkpoint recorded.
    """
    contract_addr_clean = contract_address.lower()
    client = get_supabase_client()
    if client:
        try:
            res = (
                client.table("indexer_state")
                .select("last_processed_block")
                .eq("deployment_id", deployment_id)
                .ilike("contract_address", contract_addr_clean)
                .execute()
            )
            if res.data and len(res.data) > 0:
                return int(res.data[0]["last_processed_block"])
        except Exception as exc:
            logger.debug(f"Error reading checkpoint from Supabase: {exc}")

    key = (deployment_id, contract_addr_clean)
    rec = _fallback_store["indexer_state"].get(key)
    if rec:
        return int(rec.get("last_processed_block", 0))
    return 0


def save_indexer_checkpoint(
    deployment_id: int,
    contract_address: str,
    contract_name: str,
    last_block: int,
    block_hash: Optional[str] = None,
):
    """
    Saves the indexer progress block number idempotently.
    """
    contract_addr_clean = contract_address.lower()
    client = get_supabase_client()
    now_iso = datetime.now(timezone.utc).isoformat()
    record = {
        "deployment_id": deployment_id,
        "contract_address": contract_address,
        "contract_name": contract_name,
        "last_processed_block": last_block,
        "last_processed_block_hash": block_hash or "",
        "updated_at": now_iso,
    }

    if client:
        try:
            client.table("indexer_state").upsert(
                record, on_conflict="deployment_id,contract_address"
            ).execute()
        except Exception as exc:
            logger.debug(f"Error saving checkpoint to Supabase: {exc}")

    key = (deployment_id, contract_addr_clean)
    _fallback_store["indexer_state"][key] = record


# =============================================================================
# UPSERT INDEXED ENTITIES (IDEMPOTENT & DEPLOYMENT-AWARE)
# =============================================================================

def upsert_department(data: Dict[str, Any]):
    dep_id = data["deployment_id"]
    dept_id = data["department_id"]
    data["synced_at"] = datetime.now(timezone.utc).isoformat()

    client = get_supabase_client()
    if client:
        try:
            client.table("departments").upsert(
                data, on_conflict="deployment_id,department_id"
            ).execute()
        except Exception as exc:
            logger.debug(f"Supabase upsert_department error: {exc}")

    key = (dep_id, dept_id)
    _fallback_store["departments"][key] = data


def upsert_category(data: Dict[str, Any]):
    dep_id = data["deployment_id"]
    cat_id = data["category_id"]
    data["synced_at"] = datetime.now(timezone.utc).isoformat()

    client = get_supabase_client()
    if client:
        try:
            client.table("categories").upsert(
                data, on_conflict="deployment_id,category_id"
            ).execute()
        except Exception as exc:
            logger.debug(f"Supabase upsert_category error: {exc}")

    key = (dep_id, cat_id)
    _fallback_store["categories"][key] = data


def upsert_officer(data: Dict[str, Any]):
    dep_id = data["deployment_id"]
    dept_id = data["department_id"]
    addr = data["officer_address"].lower()
    data["synced_at"] = datetime.now(timezone.utc).isoformat()

    client = get_supabase_client()
    if client:
        try:
            client.table("officers").upsert(
                data, on_conflict="deployment_id,department_id,officer_address"
            ).execute()
        except Exception as exc:
            logger.debug(f"Supabase upsert_officer error: {exc}")

    key = (dep_id, dept_id, addr)
    _fallback_store["officers"][key] = data


def upsert_grievance(data: Dict[str, Any]):
    dep_id = data["deployment_id"]
    gid = data["grievance_id"]
    data["synced_at"] = datetime.now(timezone.utc).isoformat()

    client = get_supabase_client()
    if client:
        try:
            client.table("grievances").upsert(
                data, on_conflict="deployment_id,grievance_id"
            ).execute()
        except Exception as exc:
            logger.debug(f"Supabase upsert_grievance error: {exc}")

    key = (dep_id, gid)
    _fallback_store["grievances"][key] = data


def insert_grievance_event(data: Dict[str, Any]):
    tx_hash = data.get("transaction_hash", "").lower()
    log_idx = data.get("log_index", 0)

    client = get_supabase_client()
    if client:
        try:
            client.table("grievance_events").upsert(
                data, on_conflict="transaction_hash,log_index"
            ).execute()
        except Exception as exc:
            logger.debug(f"Supabase insert_grievance_event error: {exc}")

    # Check duplicate in fallback store
    for existing in _fallback_store["grievance_events"]:
        if (
            existing.get("transaction_hash", "").lower() == tx_hash
            and existing.get("log_index") == log_idx
        ):
            return
    _fallback_store["grievance_events"].append(data)


def insert_audit_event(data: Dict[str, Any]):
    dep_id = data["deployment_id"]
    aid = data["audit_id"]
    data["synced_at"] = datetime.now(timezone.utc).isoformat()

    client = get_supabase_client()
    if client:
        try:
            client.table("audit_events").upsert(
                data, on_conflict="deployment_id,audit_id"
            ).execute()
        except Exception as exc:
            logger.debug(f"Supabase insert_audit_event error: {exc}")

    key = (dep_id, aid)
    _fallback_store["audit_events"][key] = data


def upsert_ipfs_object(data: Dict[str, Any]):
    cid = data["cid"]
    client = get_supabase_client()
    if client:
        try:
            client.table("ipfs_objects").upsert(data, on_conflict="cid").execute()
        except Exception as exc:
            logger.debug(f"Supabase upsert_ipfs_object error: {exc}")

    _fallback_store["ipfs_objects"][cid] = data


def upsert_transaction(data: Dict[str, Any]):
    tx_hash = data["tx_hash"].lower()
    client = get_supabase_client()
    if client:
        try:
            client.table("transactions").upsert(data, on_conflict="tx_hash").execute()
        except Exception as exc:
            logger.debug(f"Supabase upsert_transaction error: {exc}")

    _fallback_store["transactions"][tx_hash] = data


# =============================================================================
# READ CACHE QUERIES
# =============================================================================

def get_indexed_grievances(
    deployment_id: int,
    citizen_address: Optional[str] = None,
    department_id: Optional[int] = None,
    assigned_officer: Optional[str] = None,
    status: Optional[int] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """
    Returns indexed grievances for the active deployment.
    """
    client = get_supabase_client()
    if client:
        try:
            query = (
                client.table("grievances")
                .select("*")
                .eq("deployment_id", deployment_id)
                .order("created_at_timestamp", desc=True)
                .limit(limit)
            )
            if citizen_address:
                query = query.ilike("citizen_address", citizen_address)
            if department_id is not None:
                query = query.eq("department_id", department_id)
            if assigned_officer:
                query = query.ilike("assigned_officer", assigned_officer)
            if status is not None:
                query = query.eq("status", status)

            res = query.execute()
            if res.data is not None:
                return res.data
        except Exception as exc:
            logger.debug(f"Supabase read get_indexed_grievances error: {exc}")

    # Fallback in-memory query
    results = []
    for (dep, gid), item in _fallback_store["grievances"].items():
        if dep != deployment_id:
            continue
        if citizen_address and item.get("citizen_address", "").lower() != citizen_address.lower():
            continue
        if department_id is not None and item.get("department_id") != department_id:
            continue
        if assigned_officer and item.get("assigned_officer", "").lower() != assigned_officer.lower():
            continue
        if status is not None and item.get("status") != status:
            continue
        results.append(item)

    results.sort(key=lambda x: x.get("created_at_timestamp", 0), reverse=True)
    return results[:limit]


def get_indexed_departments(deployment_id: int) -> List[Dict[str, Any]]:
    client = get_supabase_client()
    if client:
        try:
            res = (
                client.table("departments")
                .select("*")
                .eq("deployment_id", deployment_id)
                .order("department_id", desc=False)
                .execute()
            )
            if res.data is not None:
                return res.data
        except Exception as exc:
            logger.debug(f"Supabase get_indexed_departments error: {exc}")

    results = [
        item for (dep, did), item in _fallback_store["departments"].items()
        if dep == deployment_id
    ]
    results.sort(key=lambda x: x.get("department_id", 0))
    return results


def get_indexed_categories(deployment_id: int, department_id: Optional[int] = None) -> List[Dict[str, Any]]:
    client = get_supabase_client()
    if client:
        try:
            query = (
                client.table("categories")
                .select("*")
                .eq("deployment_id", deployment_id)
                .order("category_id", desc=False)
            )
            if department_id is not None:
                query = query.eq("department_id", department_id)
            res = query.execute()
            if res.data is not None:
                return res.data
        except Exception as exc:
            logger.debug(f"Supabase get_indexed_categories error: {exc}")

    results = []
    for (dep, cid), item in _fallback_store["categories"].items():
        if dep != deployment_id:
            continue
        if department_id is not None and item.get("department_id") != department_id:
            continue
        results.append(item)
    results.sort(key=lambda x: x.get("category_id", 0))
    return results
