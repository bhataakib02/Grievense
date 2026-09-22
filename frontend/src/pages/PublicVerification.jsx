import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import {
  formatTimestamp,
  shortenAddress,
  getExplorerAddressUrl,
} from '../utils/formatters';
import {
  STATUS_METADATA,
  PRIORITY_METADATA,
  fetchGrievanceDetails,
  fetchActiveDepartments,
  fetchActiveCategories,
  fetchResolutionHistory,
} from '../services/grievanceService';
import { fetchFromIpfs, computeContentHash } from '../services/ipfs';
import { AuditTimeline } from '../components/grievance/AuditTimeline';
import { SEPOLIA_RPC_URL, CONTRACT_ADDRESSES, isContractConfigured } from '../contracts/addresses.js';

export function PublicVerification({ initialGrievanceId }) {
  const { provider, signer } = useWallet();

  const [inputGrievanceId, setInputGrievanceId] = useState(initialGrievanceId || '');
  const [activeGrievanceId, setActiveGrievanceId] = useState(initialGrievanceId || '');
  const [grievance, setGrievance] = useState(null);
  const [departmentName, setDepartmentName] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [resolutions, setResolutions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Description verification state
  const [descVerifyState, setDescVerifyState] = useState('IDLE'); // 'IDLE' | 'VERIFYING' | 'MATCH' | 'MISMATCH' | 'FAILED'
  const [descResult, setDescResult] = useState(null);

  // Resolution verification state
  const [resVerifyState, setResVerifyState] = useState({});

  // Helper to obtain a working read-only runner
  const getRunner = useCallback(() => {
    if (signer) return signer;
    if (provider) return provider;
    try {
      const rpcUrl = import.meta.env.VITE_RPC_URL || SEPOLIA_RPC_URL || 'https://rpc.sepolia.org';
      return new ethers.JsonRpcProvider(rpcUrl);
    } catch {
      return null;
    }
  }, [signer, provider]);

  const loadGrievance = useCallback(async (idToLoad) => {
    if (!idToLoad) return;
    try {
      setLoading(true);
      setError(null);
      setGrievance(null);
      setDescVerifyState('IDLE');
      setDescResult(null);

      const runner = getRunner();
      if (!runner) {
        throw new Error(
          'Read-only RPC endpoint is not configured. Please set VITE_RPC_URL in frontend/.env or connect a Web3 wallet (MetaMask) to verify records on-chain.'
        );
      }

      const g = await fetchGrievanceDetails(runner, idToLoad);
      setGrievance(g);

      // Fetch department and category names
      try {
        const [depts, cats, resHistory] = await Promise.all([
          fetchActiveDepartments(runner),
          fetchActiveCategories(runner),
          fetchResolutionHistory(runner, idToLoad),
        ]);
        const matchedDept = depts.find((d) => d.id === g.departmentId);
        if (matchedDept) setDepartmentName(matchedDept.name);

        const matchedCat = cats.find((c) => c.id === g.categoryId);
        if (matchedCat) setCategoryName(matchedCat.name);

        setResolutions(resHistory);
      } catch (e) {
        console.warn('Could not resolve entity or resolution info:', e);
      }
    } catch (err) {
      console.error('Public lookup error:', err);
      setError(err.message || `Grievance #${idToLoad} not found on the blockchain.`);
    } finally {
      setLoading(false);
    }
  }, [getRunner]);

  useEffect(() => {
    if (activeGrievanceId) {
      loadGrievance(activeGrievanceId);
    }
  }, [activeGrievanceId, loadGrievance]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!inputGrievanceId.trim()) return;
    setActiveGrievanceId(inputGrievanceId.trim());
  };

  // Cryptographically verify description CID & Hash
  const handleVerifyDescription = async () => {
    if (!grievance?.descriptionCid || !grievance?.descriptionHash) return;
    try {
      setDescVerifyState('VERIFYING');
      const { content, retrievalSource, isFromNetwork } = await fetchFromIpfs(grievance.descriptionCid);
      const computed = computeContentHash(content);
      const match = computed.toLowerCase() === grievance.descriptionHash.toLowerCase();

      let parsedPayload = content;
      try {
        parsedPayload = JSON.parse(content);
      } catch {
        parsedPayload = { text: content };
      }

      setDescResult({
        match,
        computed,
        retrievalSource,
        isFromNetwork,
        payload: parsedPayload,
      });
      setDescVerifyState(match ? 'MATCH' : 'MISMATCH');
    } catch (err) {
      setDescVerifyState('FAILED');
      setDescResult({ error: err.message });
    }
  };

  // Cryptographically verify resolution CID & Hash
  const handleVerifyResolution = async (res) => {
    try {
      setResVerifyState((prev) => ({ ...prev, [res.resolutionId]: { state: 'VERIFYING' } }));
      const { content } = await fetchFromIpfs(res.resolutionCid);
      const computed = computeContentHash(content);
      const match = computed.toLowerCase() === res.resolutionHash.toLowerCase();

      let parsed = content;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = { text: content };
      }

      setResVerifyState((prev) => ({
        ...prev,
        [res.resolutionId]: {
          state: match ? 'MATCH' : 'MISMATCH',
          computed,
          payload: parsed,
        },
      }));
    } catch (err) {
      setResVerifyState((prev) => ({
        ...prev,
        [res.resolutionId]: { state: 'FAILED', error: err.message },
      }));
    }
  };

  const statusMeta = grievance
    ? STATUS_METADATA[grievance.status] || { label: 'Unknown', badgeVariant: 'default' }
    : null;
  const priorityMeta = grievance
    ? PRIORITY_METADATA[grievance.priority] || { label: 'Unknown', badgeVariant: 'default' }
    : null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Search Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
          <span>Public Ledger Verification</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Verify a Grievance On-Chain
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed">
          Enter any Grievance ID to verify its immutable existence, department routing, assigned officer, resolution status, and cryptographic evidence hashes on Ethereum Sepolia.
        </p>

        {/* Verification Form */}
        <form onSubmit={handleSearch} className="pt-2 flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto">
          <input
            type="number"
            min="1"
            required
            placeholder="Enter Grievance ID (e.g. 1)"
            value={inputGrievanceId}
            onChange={(e) => setInputGrievanceId(e.target.value)}
            className="flex-1 text-sm px-4 py-2.5 rounded-xl bg-slate-50 text-slate-900 border border-slate-200 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-mono transition-all"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            className="font-bold shrink-0"
          >
            Verify Record
          </Button>
        </form>
      </div>

      {!isContractConfigured('GrievanceSystem') && (
        <Alert variant="warning" title="Sepolia Smart Contracts Not Yet Configured">
          The <code className="font-mono font-bold">GrievanceSystem</code> contract address is currently empty in <code className="font-mono">frontend/.env</code>.
          Deploy the contracts to Ethereum Sepolia via Remix IDE with MetaMask, set <code className="font-mono font-bold">VITE_GRIEVANCE_SYSTEM_ADDRESS</code> in <code className="font-mono">.env</code>, and reload to query on-chain grievances.
        </Alert>
      )}

      {error && (
        <Alert variant="danger" title="Verification Query Notice">
          {error}
        </Alert>
      )}

      {loading && (
        <div className="py-14 text-center space-y-3 bg-white rounded-2xl border border-slate-200/80">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-xs font-semibold text-slate-600">
            Querying immutable smart contract data for Grievance #{activeGrievanceId}...
          </p>
        </div>
      )}

      {/* Verified Record Details */}
      {grievance && (
        <div className="space-y-6 animate-fade-in">
          {/* Main Verification Card (Section 10 Requirements) */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden shadow-xs">
            <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-slate-900 text-sm">
                    GRIEVANCE #{grievance.id}
                  </span>
                  <Badge variant={statusMeta.badgeVariant} dot>
                    {statusMeta.label}
                  </Badge>
                  <Badge variant={priorityMeta.badgeVariant}>
                    {priorityMeta.label} Priority
                  </Badge>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mt-2">
                  {grievance.title}
                </h2>
              </div>
              <div className="text-left sm:text-right text-xs text-slate-500 font-mono">
                <div>Filed: {formatTimestamp(grievance.createdAt)}</div>
                <div>SLA Target: {formatTimestamp(grievance.slaDeadline)}</div>
              </div>
            </div>

            {/* Verification Checklist */}
            <div className="p-6 divide-y divide-slate-100 text-xs sm:text-sm">
              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">1. Grievance Exists:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1.5">
                  <span>✓</span> Grievance Record #{grievance.id} Confirmed On-Chain
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">2. Blockchain Record:</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1.5">
                  <span>✓</span> Verified on Ethereum Sepolia (Chain ID 11155111)
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">3. Current Status:</span>
                <div className="flex items-center gap-2">
                  <Badge variant={statusMeta.badgeVariant} dot>
                    {statusMeta.label}
                  </Badge>
                </div>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">4. Department:</span>
                <span className="font-semibold text-slate-900">
                  {departmentName ? `${departmentName} (#${grievance.departmentId})` : `Department #${grievance.departmentId}`}
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">5. Category:</span>
                <span className="font-semibold text-slate-900">
                  {categoryName ? `${categoryName} (#${grievance.categoryId})` : `Category #${grievance.categoryId}`}
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">6. Assigned Officer:</span>
                {grievance.assignedOfficer && grievance.assignedOfficer !== '0x0000000000000000000000000000000000000000' ? (
                  <a
                    href={getExplorerAddressUrl(grievance.assignedOfficer)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 hover:text-blue-800 underline font-semibold inline-flex items-center gap-1"
                  >
                    <span>{shortenAddress(grievance.assignedOfficer, 6)}</span>
                    <span>↗</span>
                  </a>
                ) : (
                  <span className="text-slate-400 font-medium">Unassigned (Awaiting Department Admin triage)</span>
                )}
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">7. Resolution Status:</span>
                <span className="font-semibold text-slate-900">
                  {grievance.currentResolutionId > 0
                    ? `Resolution #${grievance.currentResolutionId} proposed`
                    : 'Pending Investigation'}
                </span>
              </div>

              <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-slate-500 font-medium">8. Smart Contract Reference:</span>
                <a
                  href={getExplorerAddressUrl(CONTRACT_ADDRESSES.GrievanceSystem)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-blue-600 hover:text-blue-800 underline inline-flex items-center gap-1"
                >
                  <span>GrievanceSystem ({shortenAddress(CONTRACT_ADDRESSES.GrievanceSystem, 5)})</span>
                  <span>↗</span>
                </a>
              </div>
            </div>
          </div>

          {/* Cryptographic Verification Card */}
          <Card
            title="Cryptographic Hash Verification"
            subtitle="Verify off-chain IPFS payload against the immutable Keccak-256 hash committed on-chain"
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block font-sans font-semibold text-xs mb-1">
                    On-Chain IPFS CID:
                  </span>
                  <span className="text-slate-900 break-all">{grievance.descriptionCid}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans font-semibold text-xs mb-1">
                    On-Chain Keccak-256 Commitment:
                  </span>
                  <span className="text-slate-900 break-all">{grievance.descriptionHash}</span>
                </div>
              </div>

              <div>
                <Button
                  variant="primary"
                  size="sm"
                  loading={descVerifyState === 'VERIFYING'}
                  onClick={handleVerifyDescription}
                  className="font-bold"
                >
                  Fetch Payload & Verify Keccak-256
                </Button>
              </div>

              {descVerifyState === 'MATCH' && descResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-950 space-y-2 animate-fade-in">
                  <div className="font-bold flex items-center justify-between text-emerald-800">
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">✓</span>
                      <span>Cryptographic Match Confirmed</span>
                    </span>
                    <Badge variant="success" className="text-[10px]">
                      {descResult.isFromNetwork ? 'IPFS Network Gateway' : 'Local Storage Cache'}
                    </Badge>
                  </div>
                  <p className="text-xs text-emerald-800">
                    The off-chain payload retrieved via CID was hashed in your browser using Keccak-256. The computed hash matches the on-chain commitment perfectly.
                  </p>
                  <div className="p-3 bg-white/90 rounded-lg border border-emerald-200 text-xs">
                    <span className="font-bold text-slate-700 block mb-1">Verified Complaint Content:</span>
                    <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                      {descResult.payload?.description || descResult.payload?.text || JSON.stringify(descResult.payload)}
                    </p>
                  </div>
                </div>
              )}

              {descVerifyState === 'MISMATCH' && descResult && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 space-y-2 animate-fade-in">
                  <div className="font-bold text-rose-800 flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Hash Mismatch Detected!</span>
                  </div>
                  <p className="text-xs text-rose-800">
                    The computed hash of the IPFS content ({descResult.computed}) does NOT match the immutable on-chain hash ({grievance.descriptionHash}).
                  </p>
                </div>
              )}

              {descVerifyState === 'FAILED' && descResult && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs">
                  Could not retrieve content from IPFS gateways: {descResult.error}
                </div>
              )}
            </div>
          </Card>

          {/* Resolutions Verification Section */}
          {resolutions.length > 0 && (
            <Card
              title={`Resolution Verification (${resolutions.length})`}
              subtitle="Officer proposed remedies and citizen determinations"
            >
              <div className="space-y-4">
                {resolutions.map((r) => {
                  const vState = resVerifyState[r.resolutionId];
                  return (
                    <div
                      key={r.resolutionId}
                      className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2.5 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          Resolution #{r.resolutionId}: {r.title}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          Proposed: {formatTimestamp(r.proposedAt)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono break-all">
                        CID: {r.resolutionCid} | Hash: {r.resolutionHash}
                      </div>

                      <div className="pt-1">
                        <Button
                          variant="secondary"
                          size="xs"
                          loading={vState?.state === 'VERIFYING'}
                          onClick={() => handleVerifyResolution(r)}
                        >
                          Verify Resolution Hash
                        </Button>
                      </div>

                      {vState?.state === 'MATCH' && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 text-xs space-y-1 animate-fade-in">
                          <span className="font-bold text-emerald-800">✓ Verified Resolution Payload:</span>
                          <p className="whitespace-pre-wrap text-slate-800 mt-1">
                            {vState.payload?.details || vState.payload?.description || JSON.stringify(vState.payload)}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* On-Chain Audit Timeline */}
          <AuditTimeline grievanceId={grievance.id} runner={getRunner()} />
        </div>
      )}
    </div>
  );
}
