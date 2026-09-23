import React, { useState, useEffect, useCallback } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
import { useRoles } from '../hooks/useRoles';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { formatTimestamp, shortenAddress, getExplorerAddressUrl } from '../utils/formatters';
import {
  STATUSES,
  STATUS_METADATA,
  PRIORITY_METADATA,
  fetchGrievanceDetails,
  fetchActiveDepartments,
  fetchActiveCategories,
  verifyAuditRecord,
} from '../services/grievanceService';
import { getAdminDepartments, fetchDepartment } from '../services/departmentService';
import { fetchFromIpfs, computeContentHash } from '../services/ipfs';
import { CONTRACT_ADDRESSES } from '../contracts/addresses';

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

  const isAdmin =
    currentRole === ROLES.SUPER_ADMIN ||
    currentRole === ROLES.DEPARTMENT_ADMIN;

  const [grievance, setGrievance] = useState(null);
  const [departmentName, setDepartmentName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [auditInfo, setAuditInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminDeptIds, setAdminDeptIds] = useState([]);
  const [isCheckingDeptAdmin, setIsCheckingDeptAdmin] = useState(false);

  // Expandable Blockchain Details state
  const [showBlockchainDetails, setShowBlockchainDetails] = useState(false);

  // Hash verification state
  const [verificationState, setVerificationState] = useState('IDLE'); // 'IDLE' | 'VERIFYING' | 'MATCH' | 'MISMATCH' | 'FETCH_FAILED'
  const [retrievalSource, setRetrievalSource] = useState('');
  const [calculatedHash, setCalculatedHash] = useState('');
  const [isFromNetwork, setIsFromNetwork] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  const [retrievedContent, setRetrievedContent] = useState(null);

  // Immediate state wipe on account / ID change
  useEffect(() => {
    setGrievance(null);
    setRetrievedContent(null);
    setVerificationState('IDLE');
    setAdminDeptIds([]);
    setError(null);
  }, [address, grievanceId]);

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

      // Verify Department Admin isolation if connected as Department Admin
      if (currentRole === ROLES.DEPARTMENT_ADMIN && address) {
        setIsCheckingDeptAdmin(true);
        try {
          const deptIds = await getAdminDepartments(runner, address);
          if (deptIds && deptIds.length > 0) {
            setAdminDeptIds(deptIds.map(Number));
          } else {
            const dept = await fetchDepartment(runner, g.departmentId);
            if (dept?.admin && dept.admin.toLowerCase() === address.toLowerCase()) {
              setAdminDeptIds([Number(g.departmentId)]);
            } else {
              setAdminDeptIds([]);
            }
          }
        } catch (adminErr) {
          console.warn('Failed to verify admin department membership:', adminErr);
          setAdminDeptIds([]);
        } finally {
          setIsCheckingDeptAdmin(false);
        }
      }

      // Auto-fetch off-chain description from IPFS so citizen/officer sees the statement immediately
      if (g.descriptionCid) {
        fetchFromIpfs(g.descriptionCid)
          .then(({ content: rawPayload }) => {
            let parsed = null;
            try {
              parsed = JSON.parse(rawPayload);
            } catch {
              parsed = { description: rawPayload };
            }
            setRetrievedContent(parsed);
          })
          .catch((e) => {
            console.warn('Auto-fetch description from IPFS failed:', e);
          });
      }

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

  // Helper to determine active step index in lifecycle timeline (0 to 6)
  const getLifecycleStage = (status) => {
    switch (status) {
      case STATUSES.SUBMITTED:
        return 0; // Submitted
      case STATUSES.REGISTERED:
        return 1; // Registered
      case STATUSES.REOPENED:
        return 1; // Reopened - returned to Department Triage
      case STATUSES.ASSIGNED:
      case STATUSES.UNDER_REVIEW:
        return 2; // Assigned / Reviewed
      case STATUSES.UNDER_INVESTIGATION:
      case STATUSES.ESCALATED:
        return 3; // Investigating
      case STATUSES.RESOLUTION_PROPOSED:
        return 4; // Resolution Proposed
      case STATUSES.CITIZEN_REVIEW:
      case STATUSES.REJECTED:
        return 5; // Citizen Decision
      case STATUSES.ACCEPTED:
      case STATUSES.CLOSED:
        return 6; // Closed
      default:
        return 0;
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto py-16 text-center space-y-3">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="text-sm font-semibold text-slate-600">
          Querying Grievance #{grievanceId} directly from smart contract...
        </p>
      </div>
    );
  }

  if (error || !grievance) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Alert variant="danger" title="Grievance Lookup Failed">
          {error || `Grievance #${grievanceId} could not be found on the blockchain.`}
        </Alert>
        <Button variant="secondary" onClick={() => navigate(getBackRoute())}>
          ← Return to Console
        </Button>
      </div>
    );
  }

  // Cryptographic authorization & role isolation guards
  const isCitizenRole = currentRole === ROLES.CITIZEN;
  const isOfficerRole = currentRole === ROLES.OFFICER;
  const isDeptAdminRole = currentRole === ROLES.DEPARTMENT_ADMIN;
  const isSuperAdminRole = currentRole === ROLES.SUPER_ADMIN;

  const isAuthorizedDeptAdmin = adminDeptIds.includes(Number(grievance?.departmentId));
  const effectiveIsAdmin = isSuperAdminRole || (isDeptAdminRole && isAuthorizedDeptAdmin);

  const isCitizenOwner = Boolean(
    grievance.citizen && address && grievance.citizen.toLowerCase() === address.toLowerCase()
  );
  const isAssignedOfficer = Boolean(
    grievance.assignedOfficer &&
      address &&
      grievance.assignedOfficer.toLowerCase() === address.toLowerCase()
  );
  const canManageInvestigation = effectiveIsAdmin || isAssignedOfficer;

  // Department Admin Isolation: Dept Admin can access ONLY grievances of their assigned department
  if (isDeptAdminRole && !isSuperAdminRole && !isCheckingDeptAdmin) {
    if (!isAuthorizedDeptAdmin) {
      return (
        <div className="max-w-5xl mx-auto space-y-4 py-8 animate-fade-in">
          <Alert variant="danger" title="Access Denied — Department Isolation">
            You are only authorized to view grievances belonging to your assigned department.
          </Alert>
          <Button variant="secondary" onClick={() => navigate(getBackRoute())}>
            ← Return to Department Console
          </Button>
        </div>
      );
    }
  }

  // Citizen Isolation: Citizen can interact only with grievances created by that citizen
  if (isCitizenRole && !isCitizenOwner && !effectiveIsAdmin && !isAssignedOfficer) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 py-8">
        <Alert variant="danger" title="Access Denied — Citizen Privacy Isolation">
          You are connected as a Citizen. Citizens are authorized to access only grievances submitted by their own wallet address ({address}).
        </Alert>
        <Button variant="secondary" onClick={() => navigate(getBackRoute())}>
          ← Return to My Grievances
        </Button>
      </div>
    );
  }

  // Officer Isolation: Officer can operate ONLY on grievances assigned to that officer
  if (isOfficerRole && !isAssignedOfficer && !effectiveIsAdmin && !isCitizenOwner) {
    return (
      <div className="max-w-5xl mx-auto space-y-4 py-8">
        <Alert variant="danger" title="Access Denied — Officer Isolation">
          You are connected as a Field Officer. Field officers are authorized to inspect and operate only on grievances specifically assigned to their address ({address}).
        </Alert>
        <Button variant="secondary" onClick={() => navigate(getBackRoute())}>
          ← Return to Assigned Cases
        </Button>
      </div>
    );
  }

  const statusMeta = STATUS_METADATA[grievance.status] || { label: 'Unknown', badgeVariant: 'default' };
  const priorityMeta = PRIORITY_METADATA[grievance.priority] || { label: 'Unknown', badgeVariant: 'default' };
  const runner = provider || signer;
  const currentStageIndex = getLifecycleStage(grievance.status);

  const lifecycleSteps = [
    { title: 'Submitted', desc: 'Lodge ticket' },
    { title: 'Registered', desc: 'Dept triage' },
    { title: 'Assigned / Review', desc: 'Officer review' },
    { title: 'Investigating', desc: 'Active probe' },
    { title: 'Resolution Proposed', desc: 'Remedy logged' },
    { title: 'Citizen Decision', desc: 'Citizen review' },
    { title: 'Closed', desc: 'Finalized' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* 1. TOP CASE MANAGEMENT HEADER */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-extrabold text-slate-900 text-sm sm:text-base">
                GRIEVANCE #{String(grievance.id).padStart(3, '0')}
              </span>
              <Badge variant={statusMeta.badgeVariant} dot>
                {statusMeta.label}
              </Badge>
              <Badge variant={priorityMeta.badgeVariant}>
                {priorityMeta.label} Priority
              </Badge>
              {grievance.reopenCount > 0 && (
                <Badge variant="warning">
                  Reopened ({grievance.reopenCount})
                </Badge>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-2">
              {grievance.title}
            </h1>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(getBackRoute())}
            className="self-start md:self-auto shrink-0 font-bold"
          >
            ← Back to Console
          </Button>
        </div>

        {/* Essential Case Metadata Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 pt-6 text-xs">
          <div>
            <span className="text-slate-400 block font-medium">Department</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              {departmentName || `Dept #${grievance.departmentId}`}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Category</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              {categoryName || `Category #${grievance.categoryId}`}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Created Date</span>
            <span className="font-semibold text-slate-800 mt-0.5 block font-mono">
              {formatTimestamp(grievance.createdAt)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Last Updated</span>
            <span className="font-semibold text-slate-800 mt-0.5 block font-mono">
              {formatTimestamp(grievance.updatedAt)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block font-medium">Assigned Officer</span>
            {grievance.assignedOfficer && grievance.assignedOfficer !== '0x0000000000000000000000000000000000000000' ? (
              <a
                href={getExplorerAddressUrl(grievance.assignedOfficer)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-600 hover:text-blue-800 underline font-semibold mt-0.5 block"
                title="View on Sepolia Etherscan"
              >
                {shortenAddress(grievance.assignedOfficer, 5)} ↗
              </a>
            ) : (
              <span className="text-amber-700 font-semibold mt-0.5 block">
                Pending Triage
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. VISUAL LIFECYCLE TIMELINE */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Grievance Lifecycle Progression
            </h2>
            {grievance.status === STATUSES.REOPENED && (
              <Badge variant="warning" dot className="text-[10px]">
                Reopened — Pending Triage
              </Badge>
            )}
          </div>
          <span className="text-xs text-slate-400 font-mono">
            SLA Target: {formatTimestamp(grievance.slaDeadline)}
          </span>
        </div>

        {grievance.status === STATUSES.REOPENED && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
            <span className="text-xl">🔄</span>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-900">
                Grievance Reopened (Pending Departmental Triage & Assignment)
              </h4>
              <p className="text-xs text-amber-700 leading-relaxed">
                The citizen rejected the proposed resolution and reopened this grievance. The case has returned to Department Triage for administrator reassignment before investigation can resume.
              </p>
            </div>
          </div>
        )}

        {/* Stepper Bar */}
        <div className="overflow-x-auto pb-2 no-scrollbar">
          <div className="min-w-[620px] flex items-center justify-between relative">
            {lifecycleSteps.map((step, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              const isReopenedStage = isCurrent && grievance.status === STATUSES.REOPENED && idx === 1;

              const stepTitle = isReopenedStage ? 'Reopened / Triage' : step.title;
              const stepDesc = isReopenedStage ? 'Awaiting assignment' : step.desc;

              return (
                <div key={step.title} className="flex-1 flex flex-col items-center relative group">
                  {/* Connecting Line */}
                  {idx > 0 && (
                    <div
                      className={`absolute top-4 -left-1/2 w-full h-0.5 z-0 ${
                        idx <= currentStageIndex ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                    />
                  )}

                  {/* Step Bubble */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs z-10 transition-transform ${
                      isReopenedStage
                        ? 'bg-amber-500 text-white ring-4 ring-amber-100 shadow-md scale-110'
                        : isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-md scale-110'
                        : isPast
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isReopenedStage ? '🔄' : isPast ? '✓' : idx + 1}
                  </div>

                  {/* Step Label */}
                  <div className="text-center mt-2.5">
                    <span
                      className={`text-xs block font-bold whitespace-nowrap ${
                        isReopenedStage
                          ? 'text-amber-700 font-extrabold'
                          : isCurrent
                          ? 'text-blue-600 font-extrabold'
                          : isPast
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {stepTitle}
                    </span>
                    <span className="text-[10px] text-slate-400 block whitespace-nowrap">
                      {stepDesc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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

      {/* 3. CASE CONTENT PANELS */}
      <div className="space-y-6">
        {/* Core Case Overview */}
        <Card title="Case Overview & Citizen Statement" subtitle="Details recorded on-chain by the citizen">
          <div className="space-y-4">
            <div className="p-4 bg-slate-50/70 rounded-2xl border border-slate-100 space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Grievance Title & Core Statement
              </h3>
              <p className="text-sm text-slate-900 font-semibold leading-relaxed">
                {grievance.title}
              </p>
              {retrievedContent && (
                <div className="pt-2 border-t border-slate-200/60 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                  {retrievedContent.description || JSON.stringify(retrievedContent, null, 2)}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 gap-2">
              <span>
                Filing Citizen:{' '}
                <a
                  href={getExplorerAddressUrl(grievance.citizen)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-blue-600 hover:text-blue-800 underline font-semibold"
                >
                  {shortenAddress(grievance.citizen, 6)} ↗
                </a>
              </span>
              <span>
                Reopen Count: <strong className="text-slate-800">{grievance.reopenCount}</strong>
              </span>
            </div>
          </div>
        </Card>

        {/* Resolution Panel */}
        <ResolutionPanel grievance={grievance} runner={runner} />

        {/* Investigation Notes Panel */}
        <InvestigationNotesPanel
          grievance={grievance}
          runner={runner}
          signer={signer}
          userAddress={address}
          isOfficerOrAdmin={canManageInvestigation}
        />

        {/* Evidence Panel */}
        <EvidencePanel
          grievance={grievance}
          runner={runner}
          signer={signer}
          userAddress={address}
          isOfficerOrAdmin={canManageInvestigation}
        />

        {/* 4. EXPANDABLE BLOCKCHAIN DETAILS SECTION */}
        <div className="bg-white rounded-3xl border border-slate-200/90 overflow-hidden shadow-xs">
          <button
            type="button"
            onClick={() => setShowBlockchainDetails((prev) => !prev)}
            className="w-full px-6 py-4.5 bg-slate-50/70 hover:bg-slate-100/70 transition-colors flex items-center justify-between cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">⛓️</span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Blockchain Details & Cryptographic Proofs
                </h3>
                <p className="text-[11px] text-slate-500">
                  {showBlockchainDetails ? 'Click to collapse technical on-chain parameters' : 'Click to inspect smart contract addresses, Keccak-256 hashes, and IPFS CIDs'}
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-600">
              {showBlockchainDetails ? 'Hide Details ▲' : 'Show Details ▼'}
            </span>
          </button>

          {showBlockchainDetails && (
            <div className="p-6 border-t border-slate-100 space-y-6 text-xs animate-fade-in">
              {/* Technical Hash Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] space-y-1">
                  <span className="text-slate-400 block font-sans font-semibold text-xs">
                    On-Chain IPFS CID:
                  </span>
                  <span className="text-slate-900 break-all">{grievance.descriptionCid}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] space-y-1">
                  <span className="text-slate-400 block font-sans font-semibold text-xs">
                    On-Chain Keccak-256 Hash:
                  </span>
                  <span className="text-slate-900 break-all">{grievance.descriptionHash}</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] space-y-1">
                  <span className="text-slate-400 block font-sans font-semibold text-xs">
                    Authoritative Contract:
                  </span>
                  <span className="text-slate-900 break-all">
                    {CONTRACT_ADDRESSES.GrievanceSystem}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px] space-y-1">
                  <span className="text-slate-400 block font-sans font-semibold text-xs">
                    Audit Log Verification:
                  </span>
                  <span className="text-slate-900 font-sans font-semibold">
                    {auditInfo?.isVerified ? `Verified (Entry #${auditInfo.auditId})` : 'Logged on-chain'}
                  </span>
                </div>
              </div>

              {/* IPFS Verification Button */}
              <div className="pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={verificationState === 'VERIFYING'}
                  onClick={handleVerifyIntegrity}
                  className="font-bold"
                >
                  Fetch from IPFS & Confirm Keccak-256 Match
                </Button>
              </div>

              {verificationState === 'MATCH' && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 space-y-1 text-xs animate-fade-in">
                  <div className="font-bold flex items-center justify-between text-emerald-800">
                    <span>✓ Cryptographic Match Confirmed</span>
                    <Badge variant="success" className="text-[10px]">
                      {isFromNetwork ? 'Decentralized Gateway' : 'Client Cache'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-relaxed pt-1">
                    {verificationMessage}
                  </p>
                  <div className="font-mono text-[10px] text-slate-500 pt-1">
                    Calculated Hash: {calculatedHash}
                  </div>
                </div>
              )}

              {verificationState === 'MISMATCH' && (
                <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 text-xs animate-fade-in">
                  <div className="font-bold text-rose-800">⚠️ Hash Mismatch Detected!</div>
                  <p className="text-[11px] text-rose-700 mt-1">{verificationMessage}</p>
                </div>
              )}

              {verificationState === 'FETCH_FAILED' && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs">
                  {verificationMessage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. AUDIT TIMELINE */}
        <AuditTimeline grievanceId={grievance.id} runner={runner} />
      </div>
    </div>
  );
}
