import logging
from typing import Dict, Any, List
from datetime import datetime, timezone
from app.config import CONTRACT_ADDRESSES
from app.services.indexer_service import indexer
from app.db.supabase import (
    upsert_department,
    upsert_category,
    upsert_grievance,
    get_indexed_departments,
    get_indexed_categories,
    get_indexed_grievances,
)

logger = logging.getLogger("grievance.reconciliation")


class ReconciliationService:
    def __init__(self, indexer_instance=indexer):
        self.indexer = indexer_instance

    def reconcile(self) -> Dict[str, Any]:
        """
        Queries authoritative Sepolia contracts and verifies cached index data.
        Heals any stale or missing records in Supabase cache.
        NEVER mutates blockchain.
        """
        if not self.indexer.deployment:
            if not self.indexer.initialize():
                return {"success": False, "error": "Reconciliation failed: could not initialize indexer."}

        dep_id = self.indexer.deployment["id"]
        contracts = self.indexer.contracts

        report: Dict[str, Any] = {
            "success": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "deployment_id": dep_id,
            "deployment_version": self.indexer.deployment.get("deployment_version"),
            "scanned": {"departments": 0, "categories": 0, "grievances": 0},
            "repaired": {"departments": 0, "categories": 0, "grievances": 0},
            "discrepancies": [],
        }

        # 1. Reconcile Departments
        if "DepartmentManager" in contracts:
            try:
                dept_contract = contracts["DepartmentManager"]
                total_depts = dept_contract.functions.getDepartmentCount().call()
                report["scanned"]["departments"] = total_depts

                cached_depts = {
                    d["department_id"]: d
                    for d in get_indexed_departments(dep_id)
                }

                for did in range(1, total_depts + 1):
                    raw_d = dept_contract.functions.getDepartment(did).call()
                    # raw_d: (id, name, admin, isActive, createdAt, updatedAt)
                    on_chain_name = raw_d[1]
                    on_chain_admin = raw_d[2] if raw_d[2] != "0x0000000000000000000000000000000000000000" else None
                    on_chain_active = bool(raw_d[3])

                    cached = cached_depts.get(did)
                    needs_repair = False

                    if not cached:
                        needs_repair = True
                        report["discrepancies"].append({
                            "type": "department_missing",
                            "department_id": did,
                            "detail": f"Department #{did} missing from off-chain cache."
                        })
                    elif (
                        cached.get("name") != on_chain_name
                        or (cached.get("admin_address") or "").lower() != (on_chain_admin or "").lower()
                        or cached.get("is_active") != on_chain_active
                    ):
                        needs_repair = True
                        report["discrepancies"].append({
                            "type": "department_state_mismatch",
                            "department_id": did,
                            "cached": {"name": cached.get("name"), "admin": cached.get("admin_address"), "active": cached.get("is_active")},
                            "blockchain": {"name": on_chain_name, "admin": on_chain_admin, "active": on_chain_active},
                        })

                    if needs_repair:
                        upsert_department({
                            "deployment_id": dep_id,
                            "department_id": did,
                            "contract_address": CONTRACT_ADDRESSES["DepartmentManager"],
                            "name": on_chain_name,
                            "description": "",
                            "admin_address": on_chain_admin,
                            "is_active": on_chain_active,
                            "created_at_block": 0,
                            "created_at_tx": "",
                        })
                        report["repaired"]["departments"] += 1
            except Exception as exc:
                logger.error(f"Error reconciling departments: {exc}")

        # 2. Reconcile Categories
        if "DepartmentManager" in contracts:
            try:
                dept_contract = contracts["DepartmentManager"]
                total_cats = dept_contract.functions.getCategoryCount().call()
                report["scanned"]["categories"] = total_cats

                cached_cats = {
                    c["category_id"]: c
                    for c in get_indexed_categories(dep_id)
                }

                for cid in range(1, total_cats + 1):
                    raw_c = dept_contract.functions.getCategory(cid).call()
                    # raw_c: (id, departmentId, name, isActive, createdAt)
                    on_chain_dept = int(raw_c[1])
                    on_chain_name = raw_c[2]
                    on_chain_active = bool(raw_c[3])

                    cached = cached_cats.get(cid)
                    needs_repair = False

                    if not cached:
                        needs_repair = True
                        report["discrepancies"].append({
                            "type": "category_missing",
                            "category_id": cid,
                            "detail": f"Category #{cid} missing from off-chain cache."
                        })
                    elif (
                        cached.get("name") != on_chain_name
                        or cached.get("department_id") != on_chain_dept
                        or cached.get("is_active") != on_chain_active
                    ):
                        needs_repair = True
                        report["discrepancies"].append({
                            "type": "category_state_mismatch",
                            "category_id": cid,
                            "cached": {"name": cached.get("name"), "dept": cached.get("department_id"), "active": cached.get("is_active")},
                            "blockchain": {"name": on_chain_name, "dept": on_chain_dept, "active": on_chain_active},
                        })

                    if needs_repair:
                        upsert_category({
                            "deployment_id": dep_id,
                            "category_id": cid,
                            "department_id": on_chain_dept,
                            "contract_address": CONTRACT_ADDRESSES["DepartmentManager"],
                            "name": on_chain_name,
                            "description": "",
                            "is_active": on_chain_active,
                            "created_at_block": 0,
                            "created_at_tx": "",
                        })
                        report["repaired"]["categories"] += 1
            except Exception as exc:
                logger.error(f"Error reconciling categories: {exc}")

        # 3. Reconcile Grievances
        if "GrievanceSystem" in contracts:
            try:
                g_contract = contracts["GrievanceSystem"]
                total_grievances = g_contract.functions.getGrievanceCount().call()
                report["scanned"]["grievances"] = total_grievances

                cached_grievances = {
                    g["grievance_id"]: g
                    for g in get_indexed_grievances(dep_id, limit=total_grievances + 10)
                }

                for gid in range(1, total_grievances + 1):
                    raw_g = g_contract.functions.getGrievance(gid).call()
                    # raw_g: [id, citizen, departmentId, categoryId, priority, assignedOfficer, status, reopenCount, title, descriptionCid, descriptionHash, createdAt, updatedAt, slaDeadline, escalationId]
                    on_chain_status = int(raw_g[6])
                    on_chain_officer = raw_g[5] if raw_g[5] != "0x0000000000000000000000000000000000000000" else None
                    desc_hash = raw_g[10].hex() if isinstance(raw_g[10], bytes) else str(raw_g[10])
                    if not desc_hash.startswith("0x"):
                        desc_hash = f"0x{desc_hash}"

                    cached = cached_grievances.get(gid)
                    needs_repair = False

                    if not cached:
                        needs_repair = True
                        report["discrepancies"].append({
                            "type": "grievance_missing",
                            "grievance_id": gid,
                            "detail": f"Grievance #{gid} missing from off-chain cache."
                        })
                    elif (
                        cached.get("status") != on_chain_status
                        or (cached.get("assigned_officer") or "").lower() != (on_chain_officer or "").lower()
                    ):
                        needs_repair = True
                        report["discrepancies"].append({
                            "type": "grievance_status_mismatch",
                            "grievance_id": gid,
                            "cached": {"status": cached.get("status"), "officer": cached.get("assigned_officer")},
                            "blockchain": {"status": on_chain_status, "officer": on_chain_officer},
                        })

                    if needs_repair:
                        upsert_grievance({
                            "deployment_id": dep_id,
                            "grievance_id": gid,
                            "contract_address": CONTRACT_ADDRESSES["GrievanceSystem"],
                            "citizen_address": raw_g[1],
                            "department_id": int(raw_g[2]),
                            "category_id": int(raw_g[3]),
                            "priority": int(raw_g[4]),
                            "assigned_officer": on_chain_officer,
                            "status": on_chain_status,
                            "reopen_count": int(raw_g[7]),
                            "title": raw_g[8],
                            "description_cid": raw_g[9],
                            "description_hash": desc_hash,
                            "created_at_block": 0,
                            "created_at_timestamp": int(raw_g[11]),
                            "updated_at_timestamp": int(raw_g[12]),
                            "sla_deadline": int(raw_g[13]),
                        })
                        report["repaired"]["grievances"] += 1
            except Exception as exc:
                logger.error(f"Error reconciling grievances: {exc}")

        report["clean"] = (
            report["repaired"]["departments"] == 0
            and report["repaired"]["categories"] == 0
            and report["repaired"]["grievances"] == 0
        )
        return report


reconciler = ReconciliationService()
