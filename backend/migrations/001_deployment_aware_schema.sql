-- Migration 001: Deployment-Aware Schema & Indexer Checkpoint
-- Created: 2026-09-23
-- Idempotent deployment-aware schema definition for Supabase PostgreSQL

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_deployment_identity UNIQUE (chain_id, role_manager, department_manager, grievance_system, escalation_manager, audit_trail)
);

CREATE TABLE IF NOT EXISTS departments (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    department_id BIGINT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    admin_address VARCHAR(42),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at_block BIGINT,
    created_at_tx VARCHAR(66),
    updated_at_block BIGINT,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_department_deployment UNIQUE (deployment_id, department_id)
);

CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL,
    department_id BIGINT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at_block BIGINT,
    created_at_tx VARCHAR(66),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_category_deployment UNIQUE (deployment_id, category_id)
);

CREATE TABLE IF NOT EXISTS officers (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    officer_address VARCHAR(42) NOT NULL,
    department_id BIGINT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    registered_at_block BIGINT,
    registered_at_tx VARCHAR(66),
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_officer_dept_deployment UNIQUE (deployment_id, department_id, officer_address)
);

CREATE TABLE IF NOT EXISTS grievances (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    grievance_id BIGINT NOT NULL,
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
    sla_deadline BIGINT,
    created_at_block BIGINT NOT NULL,
    created_at_timestamp BIGINT NOT NULL,
    updated_at_timestamp BIGINT NOT NULL,
    resolution_details TEXT,
    resolution_evidence_cid VARCHAR(255),
    resolved_by VARCHAR(42),
    resolved_at_timestamp BIGINT,
    reopen_count INT NOT NULL DEFAULT 0,
    is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_grievance_deployment UNIQUE (deployment_id, grievance_id)
);

CREATE TABLE IF NOT EXISTS grievance_events (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    grievance_id BIGINT NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    actor_address VARCHAR(42) NOT NULL,
    previous_status INT,
    new_status INT,
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66),
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    event_timestamp BIGINT NOT NULL,
    raw_args JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_grievance_event UNIQUE (transaction_hash, log_index)
);

CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    audit_id BIGINT NOT NULL,
    action_type INT NOT NULL,
    action_name VARCHAR(100) NOT NULL,
    actor_address VARCHAR(42) NOT NULL,
    target_id BIGINT NOT NULL,
    details_hash VARCHAR(66),
    block_number BIGINT NOT NULL,
    block_hash VARCHAR(66),
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT,
    contract_address VARCHAR(42) NOT NULL,
    audit_timestamp BIGINT NOT NULL,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_audit_event_deployment UNIQUE (deployment_id, audit_id)
);

CREATE TABLE IF NOT EXISTS indexer_state (
    id SERIAL PRIMARY KEY,
    chain_id BIGINT NOT NULL DEFAULT 11155111,
    deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    contract_address VARCHAR(42) NOT NULL,
    contract_name VARCHAR(100),
    last_processed_block BIGINT NOT NULL DEFAULT 0,
    last_processed_block_hash VARCHAR(66),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_indexer_checkpoint UNIQUE (deployment_id, contract_address)
);

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

CREATE TABLE IF NOT EXISTS transactions (
    tx_hash VARCHAR(66) PRIMARY KEY,
    deployment_id INT REFERENCES deployments(id) ON DELETE SET NULL,
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

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_deployments_active ON deployments(is_active);
CREATE INDEX IF NOT EXISTS idx_departments_dep_id ON departments(deployment_id, department_id);
CREATE INDEX IF NOT EXISTS idx_categories_dept ON categories(deployment_id, department_id);
CREATE INDEX IF NOT EXISTS idx_officers_dept ON officers(deployment_id, department_id);
CREATE INDEX IF NOT EXISTS idx_grievances_citizen ON grievances(deployment_id, citizen_address);
CREATE INDEX IF NOT EXISTS idx_grievances_dept ON grievances(deployment_id, department_id);
CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(deployment_id, status);
CREATE INDEX IF NOT EXISTS idx_grievances_officer ON grievances(deployment_id, assigned_officer);
CREATE INDEX IF NOT EXISTS idx_grievance_events_lookup ON grievance_events(deployment_id, grievance_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(deployment_id, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(deployment_id, actor_address);
CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(from_address);
CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_number);
