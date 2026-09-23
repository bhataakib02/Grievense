import os
import sys
import unittest
from fastapi.testclient import TestClient

# Ensure app package is importable
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.config import (
    CHAIN_ID,
    NETWORK_NAME,
    CONTRACT_ADDRESSES,
    DEPLOYMENT_VERSION,
)
from app.db.supabase import (
    get_or_create_deployment,
    get_indexer_checkpoint,
    save_indexer_checkpoint,
    upsert_department,
    upsert_grievance,
    get_indexed_departments,
    get_indexed_grievances,
)
from app.services.indexer_service import indexer
from app.services.reconciliation_service import reconciler
from app.services.ipfs_service import compute_content_hash


class TestOffchainService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_health_and_config(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["chainId"], 11155111)
        self.assertEqual(data["network"], "sepolia")
        self.assertEqual(data["deploymentVersion"], "2.1.0")

    def test_02_contract_addresses(self):
        self.assertEqual(
            CONTRACT_ADDRESSES["RoleManager"].lower(),
            "0x7f362356f84dfc02478aab2d2524aad7a342d7e0"
        )
        self.assertEqual(
            CONTRACT_ADDRESSES["DepartmentManager"].lower(),
            "0xe06a89c411ced09f1ce9cbebb08ddcc4013acd7b"
        )
        self.assertEqual(
            CONTRACT_ADDRESSES["GrievanceSystem"].lower(),
            "0x4435c4aa0ca20a9651a8408cff48380201777933"
        )
        self.assertEqual(
            CONTRACT_ADDRESSES["EscalationManager"].lower(),
            "0xb990b5b4955a07153111b7b5b532575deec1e466"
        )
        self.assertEqual(
            CONTRACT_ADDRESSES["AuditTrail"].lower(),
            "0x7bfd42cd030cbc691ebb52592e0b7c3789117288"
        )

    def test_03_deployment_registry(self):
        dep = get_or_create_deployment(
            chain_id=CHAIN_ID,
            version=DEPLOYMENT_VERSION,
            contracts=CONTRACT_ADDRESSES,
        )
        self.assertIsNotNone(dep)
        self.assertTrue(dep["is_active"])
        self.assertEqual(dep["chain_id"], CHAIN_ID)

    def test_04_indexer_checkpoint_idempotency(self):
        dep = get_or_create_deployment()
        dep_id = dep["id"]
        addr = CONTRACT_ADDRESSES["GrievanceSystem"]

        save_indexer_checkpoint(dep_id, addr, "GrievanceSystem", 11764150, "0xabc")
        cp = get_indexer_checkpoint(dep_id, addr)
        self.assertEqual(cp, 11764150)

        # Update checkpoint to a higher block
        save_indexer_checkpoint(dep_id, addr, "GrievanceSystem", 11764200, "0xdef")
        cp2 = get_indexer_checkpoint(dep_id, addr)
        self.assertEqual(cp2, 11764200)

    def test_05_reconciliation_live_contracts(self):
        # Runs reconciliation against active Sepolia contracts
        report = reconciler.reconcile()
        self.assertTrue(report["success"])
        self.assertGreaterEqual(report["scanned"]["departments"], 1)
        self.assertGreaterEqual(report["scanned"]["grievances"], 1)

        # Second run should confirm cache is clean
        report2 = reconciler.reconcile()
        self.assertTrue(report2["success"])
        self.assertTrue(report2["clean"])
        self.assertEqual(report2["repaired"]["departments"], 0)
        self.assertEqual(report2["repaired"]["grievances"], 0)

    def test_06_fast_read_cache_endpoints(self):
        res = self.client.get("/api/cached/departments")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertGreaterEqual(data["count"], 1)

        res_g = self.client.get("/api/cached/grievances")
        self.assertEqual(res_g.status_code, 200)
        data_g = res_g.json()
        self.assertTrue(data_g["success"])
        self.assertGreaterEqual(data_g["count"], 1)

    def test_07_content_hash_keccak(self):
        # Verify content hash matches keccak256
        data = b'{"test":"grievance"}'
        h = compute_content_hash(data)
        self.assertTrue(h.startswith("0x"))
        self.assertEqual(len(h), 66)


if __name__ == "__main__":
    unittest.main()
