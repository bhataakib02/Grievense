import os
import json
import time
import asyncio
import logging
from typing import Dict, Any, List, Optional
from web3 import Web3
from web3.exceptions import Web3RPCError

from app.config import (
    SEPOLIA_RPC_URL,
    CHAIN_ID,
    CONTRACT_ADDRESSES,
    DEPLOYMENT_START_BLOCK,
    DEPLOYMENT_VERSION,
)
from app.db.supabase import (
    get_or_create_deployment,
    get_indexer_checkpoint,
    save_indexer_checkpoint,
    upsert_department,
    upsert_category,
    upsert_officer,
    upsert_grievance,
    insert_grievance_event,
    insert_audit_event,
    upsert_transaction,
)

logger = logging.getLogger("grievance.indexer")

ABI_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "src", "contracts", "abis")
)


def load_abi(contract_name: str) -> list:
    """Loads ABI JSON from frontend ABI directory or local fallback."""
    path = os.path.join(ABI_DIR, f"{contract_name}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    raise FileNotFoundError(f"ABI file not found for {contract_name} at {path}")


class BlockchainIndexer:
    def __init__(self, rpc_url: str = SEPOLIA_RPC_URL):
        self.w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 20.0}))
        self.deployment: Optional[Dict[str, Any]] = None
        self.contracts: Dict[str, Any] = {}
        self.running = False
        self.sync_lock = asyncio.Lock()

    def initialize(self):
        """Initializes deployment record and contract interfaces."""
        if not self.w3.is_connected():
            logger.warning(f"Could not connect to Sepolia RPC: {SEPOLIA_RPC_URL}")
            return False

        self.deployment = get_or_create_deployment(
            chain_id=CHAIN_ID,
            version=DEPLOYMENT_VERSION,
            contracts=CONTRACT_ADDRESSES,
        )
        logger.info(
            f"Active deployment initialized: ID={self.deployment['id']}, Version={self.deployment['deployment_version']}"
        )

        # Load web3 contracts
        for name, address in CONTRACT_ADDRESSES.items():
            if address and Web3.is_address(address):
                try:
                    abi = load_abi(name)
                    checksum_addr = Web3.to_checksum_address(address)
                    self.contracts[name] = self.w3.eth.contract(address=checksum_addr, abi=abi)
                except Exception as exc:
                    logger.error(f"Failed to load contract {name} at {address}: {exc}")

        return True

    def get_latest_block(self) -> int:
        try:
            return self.w3.eth.block_number
        except Exception as exc:
            logger.warning(f"Error fetching latest block: {exc}")
            return 0

    def sync_grievance_system(self, to_block: int, chunk_size: int = 1000):
        """Indexes all lifecycle events for GrievanceSystem."""
        if "GrievanceSystem" not in self.contracts or not self.deployment:
            return

        dep_id = self.deployment["id"]
        contract = self.contracts["GrievanceSystem"]
        addr = CONTRACT_ADDRESSES["GrievanceSystem"]

        last_block = get_indexer_checkpoint(dep_id, addr)
        from_block = last_block + 1 if last_block > 0 else DEPLOYMENT_START_BLOCK

        if from_block > to_block:
            return

        curr_from = from_block
        while curr_from <= to_block:
            curr_to = min(curr_from + chunk_size - 1, to_block)
            try:
                # Query all events in chunk
                events = contract.events.GrievanceCreated().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in events:
                    self._handle_grievance_created(ev)

                status_events = contract.events.StatusChanged().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in status_events:
                    self._handle_status_changed(ev)

                assigned_events = contract.events.GrievanceAssigned().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in assigned_events:
                    self._handle_grievance_assigned(ev)

                reassigned_events = contract.events.GrievanceReassigned().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in reassigned_events:
                    self._handle_grievance_reassigned(ev)

                resolution_events = contract.events.ResolutionSubmitted().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in resolution_events:
                    self._handle_resolution_submitted(ev)

                save_indexer_checkpoint(dep_id, addr, "GrievanceSystem", curr_to)
                curr_from = curr_to + 1
            except Exception as exc:
                if chunk_size > 50:
                    chunk_size = max(50, chunk_size // 2)
                    logger.warning(f"RPC query error, reducing chunk size to {chunk_size}: {exc}")
                else:
                    logger.error(f"Failed to sync GrievanceSystem range {curr_from}-{curr_to}: {exc}")
                    time.sleep(2)
                    break

    def sync_department_manager(self, to_block: int, chunk_size: int = 1000):
        """Indexes Department, Category, and Officer roster events."""
        if "DepartmentManager" not in self.contracts or not self.deployment:
            return

        dep_id = self.deployment["id"]
        contract = self.contracts["DepartmentManager"]
        addr = CONTRACT_ADDRESSES["DepartmentManager"]

        last_block = get_indexer_checkpoint(dep_id, addr)
        from_block = last_block + 1 if last_block > 0 else DEPLOYMENT_START_BLOCK

        if from_block > to_block:
            return

        curr_from = from_block
        while curr_from <= to_block:
            curr_to = min(curr_from + chunk_size - 1, to_block)
            try:
                dept_events = contract.events.DepartmentCreated().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in dept_events:
                    self._handle_department_created(ev)

                cat_events = contract.events.CategoryCreated().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in cat_events:
                    self._handle_category_created(ev)

                officer_events = contract.events.OfficerAddedToDepartment().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in officer_events:
                    self._handle_officer_added(ev)

                officer_rem_events = contract.events.OfficerRemovedFromDepartment().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in officer_rem_events:
                    self._handle_officer_removed(ev)

                save_indexer_checkpoint(dep_id, addr, "DepartmentManager", curr_to)
                curr_from = curr_to + 1
            except Exception as exc:
                if chunk_size > 50:
                    chunk_size = max(50, chunk_size // 2)
                    logger.warning(f"RPC query error in DeptManager, reducing chunk size to {chunk_size}: {exc}")
                else:
                    logger.error(f"Failed to sync DepartmentManager range {curr_from}-{curr_to}: {exc}")
                    time.sleep(2)
                    break

    def sync_audit_trail(self, to_block: int, chunk_size: int = 1000):
        """Indexes AuditRecorded events from AuditTrail.sol."""
        if "AuditTrail" not in self.contracts or not self.deployment:
            return

        dep_id = self.deployment["id"]
        contract = self.contracts["AuditTrail"]
        addr = CONTRACT_ADDRESSES["AuditTrail"]

        last_block = get_indexer_checkpoint(dep_id, addr)
        from_block = last_block + 1 if last_block > 0 else DEPLOYMENT_START_BLOCK

        if from_block > to_block:
            return

        curr_from = from_block
        while curr_from <= to_block:
            curr_to = min(curr_from + chunk_size - 1, to_block)
            try:
                events = contract.events.AuditRecorded().get_logs(from_block=curr_from, to_block=curr_to)
                for ev in events:
                    self._handle_audit_recorded(ev)

                save_indexer_checkpoint(dep_id, addr, "AuditTrail", curr_to)
                curr_from = curr_to + 1
            except Exception as exc:
                if chunk_size > 50:
                    chunk_size = max(50, chunk_size // 2)
                else:
                    logger.error(f"Failed to sync AuditTrail range {curr_from}-{curr_to}: {exc}")
                    break

    # =========================================================================
    # EVENT HANDLERS (READ AUTHORITATIVE ON-CHAIN GETTERS WHEN NEEDED)
    # =========================================================================

    def _handle_grievance_created(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        gid = args["grievanceId"]
        tx_hash = event["transactionHash"].hex()
        log_index = event["logIndex"]
        block_number = event["blockNumber"]

        # Call authoritative on-chain getter for complete record
        try:
            raw_g = self.contracts["GrievanceSystem"].functions.getGrievance(gid).call()
            # raw_g layout:
            # [id, citizen, departmentId, categoryId, priority, assignedOfficer, status, reopenCount, title, descriptionCid, descriptionHash, createdAt, updatedAt, slaDeadline, escalationId]
            desc_hash = raw_g[10].hex() if isinstance(raw_g[10], bytes) else str(raw_g[10])
            if not desc_hash.startswith("0x"):
                desc_hash = f"0x{desc_hash}"

            grievance_data = {
                "deployment_id": dep_id,
                "grievance_id": int(raw_g[0]),
                "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
                "citizen_address": raw_g[1],
                "department_id": int(raw_g[2]),
                "category_id": int(raw_g[3]),
                "priority": int(raw_g[4]),
                "assigned_officer": raw_g[5] if raw_g[5] != "0x0000000000000000000000000000000000000000" else None,
                "status": int(raw_g[6]),
                "reopen_count": int(raw_g[7]),
                "title": raw_g[8],
                "description_cid": raw_g[9],
                "description_hash": desc_hash,
                "created_at_block": block_number,
                "created_at_timestamp": int(raw_g[11]),
                "updated_at_timestamp": int(raw_g[12]),
                "sla_deadline": int(raw_g[13]),
            }
            upsert_grievance(grievance_data)
        except Exception as exc:
            logger.warning(f"Could not call getGrievance({gid}): {exc}")

        # Store grievance event
        insert_grievance_event({
            "deployment_id": dep_id,
            "grievance_id": gid,
            "event_name": "GrievanceCreated",
            "actor_address": args["citizen"],
            "previous_status": None,
            "new_status": 0,
            "block_number": block_number,
            "transaction_hash": tx_hash,
            "log_index": log_index,
            "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
            "event_timestamp": int(args.get("timestamp", 0)),
            "raw_args": dict(args),
        })

    def _handle_status_changed(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        gid = args["grievanceId"]
        tx_hash = event["transactionHash"].hex()
        log_index = event["logIndex"]
        block_number = event["blockNumber"]

        try:
            raw_g = self.contracts["GrievanceSystem"].functions.getGrievance(gid).call()
            desc_hash = raw_g[10].hex() if isinstance(raw_g[10], bytes) else str(raw_g[10])
            if not desc_hash.startswith("0x"):
                desc_hash = f"0x{desc_hash}"

            upsert_grievance({
                "deployment_id": dep_id,
                "grievance_id": int(raw_g[0]),
                "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
                "citizen_address": raw_g[1],
                "department_id": int(raw_g[2]),
                "category_id": int(raw_g[3]),
                "priority": int(raw_g[4]),
                "assigned_officer": raw_g[5] if raw_g[5] != "0x0000000000000000000000000000000000000000" else None,
                "status": int(raw_g[6]),
                "reopen_count": int(raw_g[7]),
                "title": raw_g[8],
                "description_cid": raw_g[9],
                "description_hash": desc_hash,
                "created_at_block": block_number,
                "created_at_timestamp": int(raw_g[11]),
                "updated_at_timestamp": int(raw_g[12]),
                "sla_deadline": int(raw_g[13]),
            })
        except Exception as exc:
            logger.debug(f"Error updating grievance status for {gid}: {exc}")

        insert_grievance_event({
            "deployment_id": dep_id,
            "grievance_id": gid,
            "event_name": "StatusChanged",
            "actor_address": args.get("actor", ""),
            "previous_status": int(args["previousStatus"]),
            "new_status": int(args["newStatus"]),
            "block_number": block_number,
            "transaction_hash": tx_hash,
            "log_index": log_index,
            "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
            "event_timestamp": int(args.get("timestamp", 0)),
            "raw_args": dict(args),
        })

    def _handle_grievance_assigned(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        gid = args["grievanceId"]
        self._refresh_grievance(gid)

        insert_grievance_event({
            "deployment_id": dep_id,
            "grievance_id": gid,
            "event_name": "GrievanceAssigned",
            "actor_address": args["assignedBy"],
            "previous_status": None,
            "new_status": 2, # ASSIGNED
            "block_number": event["blockNumber"],
            "transaction_hash": event["transactionHash"].hex(),
            "log_index": event["logIndex"],
            "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
            "event_timestamp": int(args.get("timestamp", 0)),
            "raw_args": dict(args),
        })

    def _handle_grievance_reassigned(self, event):
        args = event["args"]
        self._refresh_grievance(args["grievanceId"])

    def _handle_resolution_submitted(self, event):
        args = event["args"]
        self._refresh_grievance(args["grievanceId"])

    def _refresh_grievance(self, grievance_id: int):
        if not self.deployment or "GrievanceSystem" not in self.contracts:
            return
        try:
            raw_g = self.contracts["GrievanceSystem"].functions.getGrievance(grievance_id).call()
            desc_hash = raw_g[10].hex() if isinstance(raw_g[10], bytes) else str(raw_g[10])
            if not desc_hash.startswith("0x"):
                desc_hash = f"0x{desc_hash}"

            upsert_grievance({
                "deployment_id": self.deployment["id"],
                "grievance_id": int(raw_g[0]),
                "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
                "citizen_address": raw_g[1],
                "department_id": int(raw_g[2]),
                "category_id": int(raw_g[3]),
                "priority": int(raw_g[4]),
                "assigned_officer": raw_g[5] if raw_g[5] != "0x0000000000000000000000000000000000000000" else None,
                "status": int(raw_g[6]),
                "reopen_count": int(raw_g[7]),
                "title": raw_g[8],
                "description_cid": raw_g[9],
                "description_hash": desc_hash,
                "created_at_block": 0,
                "created_at_timestamp": int(raw_g[11]),
                "updated_at_timestamp": int(raw_g[12]),
                "sla_deadline": int(raw_g[13]),
            })
        except Exception as exc:
            logger.debug(f"Failed to refresh grievance {grievance_id}: {exc}")

    def _handle_department_created(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        dept_id = args["departmentId"]
        try:
            raw_d = self.contracts["DepartmentManager"].functions.getDepartment(dept_id).call()
            # raw_d: (id, name, admin, isActive, createdAt, updatedAt)
            upsert_department({
                "deployment_id": dep_id,
                "department_id": int(raw_d[0]),
                "contract_address": CONTRACT_ADDRESSES["DepartmentManager"],
                "name": raw_d[1],
                "description": "",
                "admin_address": raw_d[2] if raw_d[2] != "0x0000000000000000000000000000000000000000" else None,
                "is_active": bool(raw_d[3]),
                "created_at_block": event["blockNumber"],
                "created_at_tx": event["transactionHash"].hex(),
            })
        except Exception as exc:
            logger.debug(f"Error reading getDepartment({dept_id}): {exc}")

    def _handle_category_created(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        cat_id = args["categoryId"]
        try:
            raw_c = self.contracts["DepartmentManager"].functions.getCategory(cat_id).call()
            # raw_c: (id, departmentId, name, isActive, createdAt)
            upsert_category({
                "deployment_id": dep_id,
                "category_id": int(raw_c[0]),
                "department_id": int(raw_c[1]),
                "contract_address": CONTRACT_ADDRESSES["DepartmentManager"],
                "name": raw_c[2],
                "description": "",
                "is_active": bool(raw_c[3]),
                "created_at_block": event["blockNumber"],
                "created_at_tx": event["transactionHash"].hex(),
            })
        except Exception as exc:
            logger.debug(f"Error reading getCategory({cat_id}): {exc}")

    def _handle_officer_added(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        upsert_officer({
            "deployment_id": dep_id,
            "officer_address": args["officer"],
            "department_id": int(args["departmentId"]),
            "contract_address": CONTRACT_ADDRESSES["DepartmentManager"],
            "is_active": True,
            "registered_at_block": event["blockNumber"],
            "registered_at_tx": event["transactionHash"].hex(),
        })

    def _handle_officer_removed(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        upsert_officer({
            "deployment_id": dep_id,
            "officer_address": args["officer"],
            "department_id": int(args["departmentId"]),
            "contract_address": CONTRACT_ADDRESSES["DepartmentManager"],
            "is_active": False,
            "registered_at_block": event["blockNumber"],
            "registered_at_tx": event["transactionHash"].hex(),
        })

    def _handle_audit_recorded(self, event):
        dep_id = self.deployment["id"]
        args = event["args"]
        d_hash = args["detailsHash"].hex() if isinstance(args["detailsHash"], bytes) else str(args["detailsHash"])
        if not d_hash.startswith("0x"):
            d_hash = f"0x{d_hash}"

        insert_audit_event({
            "deployment_id": dep_id,
            "audit_id": int(args["auditId"]),
            "action_type": int(args["action"]),
            "action_name": f"Action #{args['action']}",
            "actor_address": args["actor"],
            "target_id": int(args["targetId"]),
            "details_hash": d_hash,
            "block_number": event["blockNumber"],
            "transaction_hash": event["transactionHash"].hex(),
            "log_index": event["logIndex"],
            "contract_address": CONTRACT_ADDRESSES["AuditTrail"],
            "audit_timestamp": int(args["timestamp"]),
        })

    # =========================================================================
    # RECONCILIATION & SYNC ENTRY POINTS
    # =========================================================================

    def sync_once(self) -> Dict[str, Any]:
        """Performs a single complete synchronization pass across all contracts."""
        if not self.deployment:
            if not self.initialize():
                return {"success": False, "error": "Failed to initialize indexer."}

        latest_block = self.get_latest_block()
        if latest_block == 0:
            return {"success": False, "error": "Could not retrieve latest block from RPC."}

        self.sync_department_manager(to_block=latest_block)
        self.sync_grievance_system(to_block=latest_block)
        self.sync_audit_trail(to_block=latest_block)

        return {
            "success": True,
            "deployment_id": self.deployment["id"],
            "latest_chain_block": latest_block,
            "checkpoint_grievances": get_indexer_checkpoint(
                self.deployment["id"], CONTRACT_ADDRESSES["GrievanceSystem"]
            ),
            "checkpoint_departments": get_indexer_checkpoint(
                self.deployment["id"], CONTRACT_ADDRESSES["DepartmentManager"]
            ),
        }

    async def start_background_loop(self, poll_interval: int = 15):
        """Asynchronous worker that continuously indexes newly minted Sepolia blocks."""
        self.running = True
        logger.info(f"Starting background blockchain event indexer (poll every {poll_interval}s)...")
        while self.running:
            try:
                async with self.sync_lock:
                    self.sync_once()
            except Exception as exc:
                logger.warning(f"Error in background indexer loop: {exc}")
            await asyncio.sleep(poll_interval)


# Global indexer instance
indexer = BlockchainIndexer()
