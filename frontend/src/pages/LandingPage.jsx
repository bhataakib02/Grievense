import React from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
import { ContractStatusCard } from '../components/blockchain/ContractStatusCard';

import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Alert } from '../components/common/Alert';
import { Button } from '../components/common/Button';

export function LandingPage() {
  const { isConnected, hasMetaMask, connectWallet, error, clearError } = useWallet();
  const { navigate } = useRouter();



  const workflowSteps = [
    {
      step: '01',
      title: 'Grievance Filing',
      actor: 'Citizen',
      description: 'Citizens submit grievances with verifiable IPFS content identifiers (CIDs) and cryptographic SHA-256 hashes permanently logged on-chain.',
    },
    {
      step: '02',
      title: 'Departmental Routing',
      actor: 'Department Admin',
      description: 'Verified department administrators review jurisdiction, register the ticket, and assign qualified field officers based on specialty.',
    },
    {
      step: '03',
      title: 'Active Investigation',
      actor: 'Assigned Officer',
      description: 'Assigned officers submit on-chain investigation milestones, attach cryptographic evidence, and present proposed resolutions.',
    },
    {
      step: '04',
      title: 'Citizen Confirmation & Close',
      actor: 'Citizen / System',
      description: 'Citizens review the resolution and choose to accept (closing the grievance) or reject with justification for reinvestigation.',
    },
    {
      step: '05',
      title: 'Enforced SLA Escalation',
      actor: 'Smart Contract',
      description: 'Automated, deterministic SLA tracking escalates overdue grievances to senior department authorities if resolution deadlines expire.',
    },
  ];

  const roleArchitecture = [
    {
      role: 'Citizen',
      badge: 'Public Access',
      badgeVariant: 'primary',
      route: '/citizen',
      description: 'Self-register on-chain to file new grievances, monitor progress, upload evidence hashes, and accept or dispute proposed resolutions.',
      status: 'Dashboard Active (Step 11A)',
    },
    {
      role: 'Officer',
      badge: 'Field Operations',
      badgeVariant: 'warning',
      route: '/officer',
      description: 'Handle assigned cases, initiate formal investigations, log notes, upload evidence artifacts, and submit completion reports.',
      status: 'Dashboard Active (Step 11A)',
    },
    {
      role: 'Department Admin',
      badge: 'Supervisory',
      badgeVariant: 'neutral',
      route: '/dept-admin',
      description: 'Manage departmental officer rosters, triage incoming grievances, route cases, and resolve escalated bottlenecks.',
      status: 'Dashboard Active (Step 11A)',
    },
    {
      role: 'Super Admin',
      badge: 'System Governance',
      badgeVariant: 'danger',
      route: '/super-admin',
      description: 'Configure public departments, register dynamic grievance categories, update global SLA duration tiers, and monitor the audit log.',
      status: 'Dashboard Active (Step 11A)',
    },
  ];


  return (
    <div className="space-y-12">
      {/* Wallet Error Alert */}
      {error && (
        <Alert variant="danger" title="Wallet Error" onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto pt-4 pb-8 sm:pt-8 sm:pb-12">
        <Badge variant="primary" className="mb-4">
          Decentralized Governance & Public Accountability
        </Badge>
        <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          Blockchain-Based Public Grievance Tracking System
        </h2>
        <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
          An open, immutable public administration protocol ensuring transparent lifecycle tracking, SLA accountability, and verifiable audit trails for municipal and government grievances.
        </p>

        {/* Hero Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          {!isConnected ? (
            <Button
              onClick={connectWallet}
              variant="primary"
              size="lg"
              className="w-full sm:w-auto shadow-md"
            >
              Connect Wallet To Get Started
            </Button>
          ) : (
            <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Wallet Connected. Smart Contract Foundation Initialized.</span>
            </div>
          )}

          <Button
            onClick={() => navigate('/verify')}
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            🔍 Verify Grievance on Blockchain
          </Button>

          {!hasMetaMask && (
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors w-full sm:w-auto"
            >
              Download MetaMask
            </a>
          )}
        </div>
      </section>

      {/* Smart Contract Infrastructure Status Card */}
      <section>
        <ContractStatusCard />
      </section>

      {/* Transparent Lifecycle Workflow */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
            End-to-End Verifiable Workflow
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Every step is protected by smart-contract rules and logged in the immutable audit trail.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {workflowSteps.map((item) => (
            <div
              key={item.step}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between hover:border-blue-300 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {item.step}
                  </span>
                  <Badge variant="neutral">{item.actor}</Badge>
                </div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1.5">
                  {item.title}
                </h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Role-Based Architectural Foundation */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
            Role-Based Access Control Architecture
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Authorization is natively governed on-chain by <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">RoleManager.sol</code>.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {roleArchitecture.map((item) => (
            <Card key={item.role} className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-base font-bold text-slate-900">{item.role}</h4>
                  <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                <span className="text-[11px] text-slate-400 font-medium">
                  {item.status}
                </span>
                <Button
                  onClick={() => navigate(item.route)}
                  variant="secondary"
                  size="sm"
                  className="w-full text-xs"
                >
                  Enter {item.role} Console →
                </Button>
              </div>
            </Card>
          ))}
        </div>

      </section>

      {/* Core Protocol Guarantees */}
      <section className="bg-slate-900 text-white rounded-2xl p-6 sm:p-10 shadow-md">
        <div className="max-w-3xl">
          <Badge variant="neutral" className="bg-slate-800 text-slate-200 border-slate-700 mb-3">
            Core Protocol Guarantees
          </Badge>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Built for Integrity, Transparency, and Citizen Trust
          </h3>
          <p className="text-slate-400 mt-2 text-sm leading-relaxed">
            The system replaces opaque administrative processes with mathematically provable state transitions on an EVM-compatible blockchain.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 pt-6 border-t border-slate-800 text-xs">
            <div>
              <h5 className="font-semibold text-slate-200 text-sm mb-1">
                Forensic Audit Trail
              </h5>
              <p className="text-slate-400 leading-relaxed">
                Over 20 distinct system actions trigger atomic writes to the <code className="text-slate-200 font-mono">AuditTrail</code> contract, storing caller addresses, target IDs, and contextual SHA-256 hashes.
              </p>
            </div>
            <div>
              <h5 className="font-semibold text-slate-200 text-sm mb-1">
                Deterministic SLA Enforcement
              </h5>
              <p className="text-slate-400 leading-relaxed">
                Priorities (Low, Medium, High, Critical) are mapped to deterministic deadlines stored on-chain, enabling provable escalation when resolution SLAs are missed.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
