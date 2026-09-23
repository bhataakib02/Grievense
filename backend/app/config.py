import os
from typing import Dict, Any
from dotenv import load_dotenv

# Load backend .env if available
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# Target Blockchain: Ethereum Sepolia
CHAIN_ID = int(os.getenv("CHAIN_ID", "11155111"))
NETWORK_NAME = os.getenv("NETWORK_NAME", "sepolia")
SEPOLIA_RPC_URL = os.getenv(
    "SEPOLIA_RPC_URL",
    os.getenv("VITE_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com")
)

# Current Authoritative Sepolia Contract Addresses
CONTRACT_ADDRESSES = {
    "RoleManager": os.getenv("ROLE_MANAGER_ADDRESS", "0x7F362356f84dfc02478aAB2d2524aaD7a342D7e0"),
    "DepartmentManager": os.getenv("DEPARTMENT_MANAGER_ADDRESS", "0xE06A89c411CEd09f1cE9Cbebb08ddCC4013aCD7B"),
    "GrievanceSystem": os.getenv("GRIEVANCE_SYSTEM_ADDRESS", "0x4435C4Aa0Ca20a9651a8408Cff48380201777933"),
    "EscalationManager": os.getenv("ESCALATION_MANAGER_ADDRESS", "0xB990B5b4955A07153111B7b5B532575deEc1e466"),
    "AuditTrail": os.getenv("AUDIT_TRAIL_ADDRESS", "0x7bFD42cD030CBc691ebB52592e0b7c3789117288"),
}

# The block where this contract version was deployed on Sepolia
DEPLOYMENT_START_BLOCK = int(os.getenv("DEPLOYMENT_START_BLOCK", "11764100"))
DEPLOYMENT_VERSION = os.getenv("DEPLOYMENT_VERSION", "2.1.0")

# Supabase Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = (
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    or os.getenv("SUPABASE_KEY", "").strip()
    or os.getenv("SUPABASE_ANON_KEY", "").strip()
)

# Pinata IPFS Configuration
PINATA_JWT = os.getenv("PINATA_JWT", "").strip()
PINATA_GATEWAY = os.getenv("PINATA_GATEWAY", "https://gateway.pinata.cloud").rstrip("/")
