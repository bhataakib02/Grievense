import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
import { useRoles } from '../hooks/useRoles';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { formatTimestamp, shortenAddress } from '../utils/formatters';
import {
  STATUS_METADATA,
  PRIORITY_METADATA,
  fetchGrievanceDetails,
  fetchActiveDepartments,
  fetchActiveCategories,
  verifyAuditRecord,
} from '../services/grievanceService';
import { fetchFromIpfs, computeContentHash } from '../services/ipfs';

// Modular workflow components
import { OfficerActionBar } from '../components/grievance/OfficerActionBar';
import { CitizenActionBar } from '../components/grievance/CitizenActionBar';
import { InvestigationNotesPanel } from '../components/grievance/InvestigationNotesPanel';
import { EvidencePanel } from '../components/grievance/EvidencePanel';
import { ResolutionPanel } from '../components/grievance/ResolutionPanel';
import { AuditTimeline } from '../components/grievance/AuditTimeline';
import { EscalationBanner } from '../components/grievance/EscalationBanner';

export function GrievanceDetails({ grievanceId }) {
  const { provider, signer, address } = useWallet();
  const { currentRole, ROLES } = useRoles();
  const { navigate } = useRouter();

  const isOfficerOrAdmin =
    currentRole === ROLES.SUPER_ADMIN ||
    currentRole === ROLES.DEPARTMENT_ADMIN ||
    currentRole === ROLES.OFFICER;

  const [grievance, setGrievance] = useState(null);
  const [departmentName, setDepartmentName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [auditInfo, setAuditInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hash verification state
  const [verificationState, setVerificationState] = useState('IDLE'); // 'IDLE' | 'VERIFYING' | 'MATCH' | 'MISMATCH' | 'FETCH_FAILED'
  const [retrievalSource, setRetrievalSource] = useState('');
  const [calculatedHash, setCalculatedHash] = useState('');
  const [isFromNetwork, setIsFromNetwork] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [retrievedContent, setRetrievedContent] = useState(null);

  const loadData = useCallback(async () => {
    if (!grievanceId) return;

    setIsLoading(true);
    setError(null);

    try {
      const runner = provider || signer;
      if (!runner) {
        throw new Error('Please connect your wallet or provider to view grievance data.');
      }

      const g = await fetchGrievanceDetails(runner, grievanceId);
      setGrievance(g);

      // Fetch department and category names for human readability
      try {
        const [depts, cats] = await Promise.all([
          fetchActiveDepartments(runner),
          fetchActiveCategories(runner),
        ]);
        const matchedDept = depts.find((d) => d.id === g.departmentId);
        if (matchedDept) setDepartmentName(matchedDept.name);

        const matchedCat = cats.find((c) => c.id === g.categoryId);
        if (matchedCat) setCategoryName(matchedCat.name);
      } catch (e) {
        console.warn('Could not resolve entity names:', e);
      }

      // Read audit trail verification
      try {
        const audit = await verifyAuditRecord(runner, g.id, g.citizen, g.descriptionHash);
        setAuditInfo(audit);
      } catch (auditErr) {
        console.warn('Audit record query failed:', auditErr);
      }
    } catch (err) {
      console.error('Failed to load grievance details:', err);
      setError(err.message || 'Could not load grievance details from smart contract.');
    } finally {
      setIsLoading(false);
    }
  }, [grievanceId, provider, signer]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (active) {
        await loadData();
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [loadData]);

  // Execute cryptographic hash verification of IPFS content against on-chain hash
  const handleVerifyIntegrity = async () => {
    if (!grievance?.descriptionCid || !grievance?.descriptionHash) {
      setVerificationState('FETCH_FAILED');
      setVerificationMessage('Missing on-chain CID or description hash.');
      return;
    }

    setVerificationState('VERIFYING');
    setVerificationMessage('Querying IPFS network and computing cryptographic Keccak-256 hash...');
    setRetrievalSource('');
    setCalculatedHash('');

    try {
      const { content: rawPayload, retrievalSource: source, isFromNetwork: fromNet } = await fetchFromIpfs(
        grievance.descriptionCid
      );

      const computed = computeContentHash(rawPayload);
      setRetrievalSource(source);
      setCalculatedHash(computed);
      setIsFromNetwork(fromNet);

      let parsedPayload = null;
      try {
        parsedPayload = JSON.parse(rawPayload);
      } catch {
        parsedPayload = { description: rawPayload };
      }
      setRetrievedContent(parsedPayload);

      if (computed.toLowerCase() === grievance.descriptionHash.toLowerCase()) {
        setVerificationState('MATCH');
        setVerificationMessage(
          'Cryptographic Integrity Verified: The Keccak-256 hash of the off-chain payload retrieved via IPFS exactly matches the on-chain commitment.'
        );
      } else {
        setVerificationState('MISMATCH');
        setVerificationMessage(
          'Integrity Alert: The Keccak-256 hash of the payload does NOT match the on-chain commitment!'
        );
      }
    } catch (err) {
      console.error('Integrity verification error:', err);
      setVerificationState('FETCH_FAILED');
      setVerificationMessage(
        `Could not retrieve content for CID ${grievance.descriptionCid} from IPFS network gateways. The on-chain hash commitment remains: ${grievance.descriptionHash}`
      );
    }
  };

  const getBackRoute = () => {
    if (currentRole === ROLES.SUPER_ADMIN) return '/super-admin';
    if (currentRole === ROLES.DEPARTMENT_ADMIN) return '/dept-admin';
    if (currentRole === ROLES.OFFICER) return '/officer';
    return '/citizen';
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-12 text-center space-y-3">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="text-sm font-medium text-slate-600">
          Querying Grievance #{grievanceId} directly from smart contract...
        </p>
      </div>
    );
  }

  if (error || !grievance) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Alert variant="danger" title="Grievance Lookup Failed">
          {error || `Grievance #${grievanceId} could not be found.`}
        </Alert>
        <Button variant="secondary" onClick={() => navigate(getBackRoute())}>
          ← Return to Dashboard
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_METADATA[grievance.status] || { label: 'Unknown', badgeVariant: 'default' };
  const priorityMeta = PRIORITY_METADATA[grievance.priority] || { label: 'Unknown', badgeVariant: 'default' };
  const runner = provider || signer;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">Grievance Record</span>
            <Badge variant="neutral" className="font-mono font-bold text-slate-800">
              #{grievance.id}
            </Badge>
            <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
            <Badge variant={priorityMeta.badgeVariant}>{priorityMeta.label} Priority</Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{grievance.title}</h1>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate(getBackRoute())}>
          ← Back to Console
        </Button>
      </div>

      {/* Escalation Alert & Controls */}
      <EscalationBanner
        grievance={grievance}
        runner={runner}
        signer={signer}
        userAddress={address}
        onActionSuccess={loadData}
      />

      {/* Role Action Bars */}
      <OfficerActionBar
        grievance={grievance}
        signer={signer}
        userAddress={address}
        onActionSuccess={loadData}
      />

      <CitizenActionBar
        grievance={grievance}
        signer={signer}
        userAddress={address}
        onActionSuccess={loadData}
      />

      {/* Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Grievance Overview (All 15 Fields)" subtitle="On-chain storage record from GrievanceSystem.sol">
            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">1. Grievance ID:</span>
                <span className="font-mono font-bold text-slate-900">#{grievance.id}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">2. Citizen Address:</span>
                <span className="font-mono text-slate-800 text-xs sm:text-sm">
                  {shortenAddress(grievance.citizen, 6)}
                  {address && grievance.citizen.toLowerCase() === address.toLowerCase() && (
                    <span className="ml-1.5 text-xs text-emerald-600 font-sans font-medium">(You)</span>
                  )}
                </span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">3. Status:</span>
                <Badge variant={statusMeta.badgeVariant}>{statusMeta.label} ({grievance.status})</Badge>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">4. Priority:</span>
                <Badge variant={priorityMeta.badgeVariant}>{priorityMeta.label} ({grievance.priority})</Badge>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">5. Reopen Count:</span>
                <span className="font-mono text-slate-800">{grievance.reopenCount}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">6. Assigned Officer:</span>
                <span className="font-mono text-slate-800 text-xs">
                  {grievance.assignedOfficer && grievance.assignedOfficer !== '0x0000000000000000000000000000000000000000'
                    ? shortenAddress(grievance.assignedOfficer, 6)
                    : 'Unassigned (Awaiting Department Admin triage)'}
                </span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">7. Department ID:</span>
                <span className="font-medium text-slate-800">
                  {departmentName ? `${departmentName} (#${grievance.departmentId})` : `Dept #${grievance.departmentId}`}
                </span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">8. Category ID:</span>
                <span className="font-medium text-slate-800">
                  {categoryName ? `${categoryName} (#${grievance.categoryId})` : `Category #${grievance.categoryId}`}
                </span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">9. Title:</span>
                <span className="text-slate-800 font-medium">{grievance.title}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">10. Description CID:</span>
                <span className="font-mono text-slate-800 text-xs break-all">{grievance.descriptionCid}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">11. Description Hash:</span>
                <span className="font-mono text-slate-800 text-xs break-all">{grievance.descriptionHash}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">12. Created At:</span>
                <span className="text-slate-800">{formatTimestamp(grievance.createdAt)}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">13. Updated At:</span>
                <span className="text-slate-800">{formatTimestamp(grievance.updatedAt)}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">14. SLA Deadline:</span>
                <span className="font-mono text-slate-800">{formatTimestamp(grievance.slaDeadline)}</span>
              </div>

              <div className="py-2.5 flex justify-between">
                <span className="text-slate-500">15. Current Resolution ID:</span>
                <span className="font-mono text-slate-800 font-bold">
                  {grievance.currentResolutionId > 0 ? `#${grievance.currentResolutionId}` : '0 (None)'}
                </span>
              </div>
            </div>
          </Card>

          {/* Retrieved Description */}
          {retrievedContent && (
            <Card title="IPFS Verified Description Payload" subtitle="Off-chain payload retrieved via CID">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {retrievedContent.description || JSON.stringify(retrievedContent, null, 2)}
                </p>
                {retrievedContent.submittedAt && (
                  <div className="text-[11px] text-slate-400 font-mono">
                    Schema: {retrievedContent.schemaVersion || '1.0'} | Submitted:{' '}
                    {formatTimestamp(retrievedContent.submittedAt)}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Resolution Panel */}
          <ResolutionPanel grievance={grievance} runner={runner} />

          {/* Investigation Notes Panel */}
          <InvestigationNotesPanel
            grievance={grievance}
            runner={runner}
            signer={signer}
            userAddress={address}
            isOfficerOrAdmin={isOfficerOrAdmin}
          />

          {/* Evidence Panel */}
          <EvidencePanel
            grievance={grievance}
            runner={runner}
            signer={signer}
            userAddress={address}
            isOfficerOrAdmin={isOfficerOrAdmin}
          />
        </div>

        {/* Sidebar: Hash Verification, Audit Proofs & Timeline (1 col) */}
        <div className="space-y-6">
          <Card title="Cryptographic Integrity" subtitle="Dual-reference IPFS hash verification">
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block font-medium">On-Chain IPFS CID:</span>
                <span className="font-mono text-[11px] text-slate-800 break-all bg-slate-50 p-1.5 rounded block border border-slate-200 mt-0.5">
                  {grievance.descriptionCid}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block font-medium">On-Chain Keccak-256 Hash:</span>
                <span className="font-mono text-[11px] text-slate-800 break-all bg-slate-50 p-1.5 rounded block border border-slate-200 mt-0.5">
                  {grievance.descriptionHash}
                </span>
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={verificationState === 'VERIFYING'}
                  onClick={handleVerifyIntegrity}
                  className="w-full text-xs font-semibold"
                >
                  Verify Description Integrity
                </Button>
              </div>

              {verificationState === 'MATCH' && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-900 text-xs space-y-1.5">
                  <div className="font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1 text-emerald-700">✓ MATCH</span>
                    <Badge variant="success" className="text-[10px]">
                      {isFromNetwork ? 'Decentralized Network' : 'Client Cache'}
                    </Badge>
                  </div>
                  <div className="text-[11px] space-y-1 text-emerald-800 pt-1 border-t border-emerald-200">
                    <div>
                      <span className="font-semibold text-slate-600">Retrieval Source:</span>{' '}
                      <span className="font-mono text-[10px] break-all">{retrievalSource}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Calculated Hash:</span>{' '}
                      <span className="font-mono text-[10px] break-all">{calculatedHash}</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">On-Chain Hash:</span>{' '}
                      <span className="font-mono text-[10px] break-all">{grievance.descriptionHash}</span>
                    </div>
                  </div>
                  <p className="mt-1 leading-snug text-emerald-700 text-[11px]">{verificationMessage}</p>
                </div>
              )}

              {verificationState === 'MISMATCH' && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 text-xs space-y-1.5">
                  <div className="font-bold flex items-center justify-between text-rose-700">
                    <span>⚠️ MISMATCH</span>
                    <Badge variant="danger" className="text-[10px]">Integrity Breach</Badge>
                  </div>
                  <div className="text-[11px] space-y-1 text-rose-800 pt-1 border-t border-rose-200">
                    <div>
                      <span className="font-semibold">Calculated:</span>{' '}
                      <span className="font-mono text-[10px] break-all">{calculatedHash}</span>
                    </div>
                    <div>
                      <span className="font-semibold">On-Chain:</span>{' '}
                      <span className="font-mono text-[10px] break-all">{grievance.descriptionHash}</span>
                    </div>
                  </div>
                  <p className="mt-1 leading-snug text-rose-700 text-[11px]">{verificationMessage}</p>
                </div>
              )}

              {verificationState === 'FETCH_FAILED' && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs">
                  <div className="font-bold text-amber-800">Notice</div>
                  <p className="mt-1 leading-snug text-[11px] text-amber-700">{verificationMessage}</p>
                </div>
              )}
            </div>
          </Card>

          <Card title="Audit Trail Verification" subtitle="Forensic immutable on-chain proofs">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Audit Proof:</span>
                {auditInfo?.isVerified ? (
                  <Badge variant="success" className="text-[11px]">
                    Verified (ID #{auditInfo.auditId})
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-[11px]">
                    GrievanceCreated Event
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Actions are logged on-chain by AuditTrail.sol with immutable target bindings.
              </p>
            </div>
          </Card>

          {/* Audit Timeline */}
          <AuditTimeline grievanceId={grievance.id} runner={runner} />
        </div>
      </div>
    </div>
  );
}
