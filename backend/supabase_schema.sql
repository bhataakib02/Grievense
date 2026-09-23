-- =====================================================================
-- BLOCKCHAIN-BASED PUBLIC GRIEVANCE TRACKING SYSTEM
-- OFF-CHAIN SUPABASE INDEX & EVENT CACHE SCHEMA
-- =====================================================================
--
-- STRICT ARCHITECTURAL PRINCIPLE:
-- 1. Ethereum Sepolia Solidity smart contracts are the SOLE AUTHORITATIVE
--    SOURCE OF TRUTH.
-- 2. This database serves purely as an OFF-CHAIN INDEX and cache for fast
--    read queries, analytics, and event search.
-- 3. Never allow Supabase values to override verified on-chain state.
-- 4. If any discrepancy exists between on-chain data and Supabase, the
--    blockchain state MUST always prevail.
-- =====================================================================

-- 1. Deployments table: tracks contract addresses across deployment versions
CREATE TABLE IF NOT EXISTS deployments (
    id SERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL DEFAULT 11155111,
    network VARCHAR(50) NOT NULL DEFAULT 'sepolia',
    deployment_version VARCHAR(50) NOT NULL,
    deployment_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    role_manager VARCHAR(42) NOT NULL,
    department_manager VARCHAR(42) NOT NULL,
    grievance_system VARCHAR(42) NOT NULL,
    escalation_manager VARCHAR(42) NOT NULL,
    audit_trail VARCHAR(42) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Departments table: index of registered on-chain departments
CREATE TABLE IF NOT EXISTS departments (
    id BIGINT PRIMARY KEY,
    deployment_id INT REFERENCES deployments(id),
    contract_address VARCHAR(42) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    admin_address VARCHAR(42),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at_block BIGINT,
    created_at_tx VARCHAR(66),
    updated_at_block BIGINT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Categories table: index of department-scoped grievance categories
CREATE TABLE IF NOT EXISTS categories (
    id BIGINT PRIMARY KEY,
    department_id BIGINT NOT NULL,
    deployment_id INT REFERENCES deployments(id),
    contract_address VARCHAR(42) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at_block BIGINT,
    created_at_tx VARCHAR(66),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Officers table: roster of verified department officers
CREATE TABLE IF NOT EXISTS officers (
    officer_address VARCHAR(42) NOT NULL,
    department_id BIGINT NOT NULL,
    deployment_id INT REFERENCES deployments(id),
    contract_address VARCHAR(42) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    registered_at_block BIGINT,
    registered_at_tx VARCHAR(66),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (officer_address, department_id)
);

-- 5. Grievances table: indexed on-chain grievance records
CREATE TABLE IF NOT EXISTS grievances (
    id BIGINT PRIMARY KEY,
    deployment_id INT REFERENCES deployments(id),
    contract_address VARCHAR(42) NOT NULL,
    citizen_address VARCHAR(42) NOT NULL,
    department_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,
    priority INT NOT NULL,
    status INT NOT NULL,
    assigned_officer VARCHAR(42),
    title VARCHAR(255) NOT NULL,
    description_cid VARCHAR(255),
    description_hash VARCHAR(66),
    evidence_cid VARCHAR(255),
    evidence_hash VARCHAR(66),
    created_at_block BIGINT NOT NULL,
    created_at_timestamp BIGINT NOT NULL,
    updated_at_timestamp BIGINT NOT NULL,
    resolution_details TEXT,
    resolution_evidence_cid VARCHAR(255),
    resolved_by VARCHAR(42),
    resolved_at_timestamp BIGINT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Grievance Events: log of lifecycle mutations emitted on-chain
CREATE TABLE IF NOT EXISTS grievance_events (
    id SERIAL PRIMARY KEY,
    grievance_id BIGINT NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    actor_address VARCHAR(42) NOT NULL,
    previous_status INT,
    new_status INT,
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    event_timestamp BIGINT NOT NULL,
    raw_args JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_grievance_event UNIQUE (transaction_hash, log_index)
);

-- 7. Audit Events: immutable forensic entries from AuditTrail.sol
CREATE TABLE IF NOT EXISTS audit_events (
    audit_id BIGINT PRIMARY KEY,
    action_type INT NOT NULL,
    action_name VARCHAR(100) NOT NULL,
    actor_address VARCHAR(42) NOT NULL,
    target_id BIGINT NOT NULL,
    details_hash VARCHAR(66),
    block_number BIGINT NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    audit_timestamp BIGINT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. IPFS Objects: index of off-chain documents pinned to IPFS
CREATE TABLE IF NOT EXISTS ipfs_objects (
    cid VARCHAR(255) PRIMARY KEY,
    content_hash VARCHAR(66) NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,
    pinned_by VARCHAR(42),
    provider VARCHAR(50) DEFAULT 'Pinata',
    gateway_url TEXT,
    is_persisted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Transactions: log of transactions interacting with system contracts
CREATE TABLE IF NOT EXISTS transactions (
    tx_hash VARCHAR(66) PRIMARY KEY,
    block_number BIGINT NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42) NOT NULL,
    function_signature VARCHAR(10),
    function_name VARCHAR(100),
    status INT NOT NULL DEFAULT 1,
    gas_used BIGINT,
    effective_gas_price BIGINT,
    block_timestamp BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_grievances_citizen ON grievances(citizen_address);
CREATE INDEX IF NOT EXISTS idx_grievances_department ON grievances(department_id);
CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
CREATE INDEX IF NOT EXISTS idx_grievance_events_grievance_id ON grievance_events(grievance_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_address);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
