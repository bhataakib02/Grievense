import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { useRouter } from '../hooks/useRouter';
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
  fetchResolutionHistory,
} from '../services/grievanceService';
import { fetchFromIpfs, computeContentHash } from '../services/ipfs';
import { AuditTimeline } from '../components/grievance/AuditTimeline';

export function PublicVerification({ initialGrievanceId }) {
  const { provider, signer } = useWallet();
  const { navigate } = useRouter();

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

  // Helper to obtain a working read-only provider
  const getRunner = useCallback(() => {
    if (signer) return signer;
    if (provider) return provider;
    try {
      const rpcUrl = import.meta.env.VITE_RPC_URL;
      if (!rpcUrl) return null;
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
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Top Banner */}
      <Card className="bg-linear-to-r from-slate-900 via-blue-950 to-indigo-950 text-white border-0 shadow-md">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="neutral" className="bg-blue-900/80 text-blue-200 border-blue-700">
              Open Blockchain Inspector
            </Badge>
            <span className="text-xs text-slate-300">Public & Auditor Access</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            Cryptographic Grievance Verification Portal
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            Verify the immutability, on-chain commitments, IPFS payloads, and forensic audit trails
            for any public grievance in the republic without requiring wallet authentication.
          </p>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="pt-2 flex gap-2 max-w-lg">
            <input
              type="number"
              min="1"
              required
              placeholder="Enter Grievance ID (e.g. 1)"
              value={inputGrievanceId}
              onChange={(e) => setInputGrievanceId(e.target.value)}
              className="flex-1 text-xs px-3.5 py-2 rounded-lg bg-slate-800/90 text-white border border-slate-700 outline-none focus:border-blue-400 placeholder-slate-400 font-mono"
            />
            <Button type="submit" variant="primary" size="sm" loading={loading}>
              Inspect Grievance
            </Button>
          </form>
        </div>
      </Card>

      {error && (
        <Alert variant="danger" title="Verification Query Error">
          {error}
        </Alert>
      )}

      {loading && (
        <div className="py-12 text-center space-y-3">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-xs font-medium text-slate-600">
            Querying immutable smart contract data for Grievance #{activeGrievanceId}...
          </p>
        </div>
      )}

      {grievance && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-900 text-sm">
                  Grievance #{grievance.id}
                </span>
                <Badge variant={statusMeta.badgeVariant}>{statusMeta.label}</Badge>
                <Badge variant={priorityMeta.badgeVariant}>{priorityMeta.label} Priority</Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mt-1">{grievance.title}</h3>
            </div>
            <div className="text-right text-xs text-slate-500 font-mono">
              <div>Created: {formatTimestamp(grievance.createdAt)}</div>
              <div>SLA: {formatTimestamp(grievance.slaDeadline)}</div>
            </div>
          </div>

          {/* Cryptographic Verification Card */}
          <Card
            title="Decentralized IPFS & Hash Integrity Verification"
            subtitle="Verify that the off-chain description has not been altered or tampered with"
          >
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 block font-sans font-medium text-xs mb-0.5">
                    On-Chain IPFS CID:
                  </span>
                  <span className="text-slate-900 break-all">{grievance.descriptionCid}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-sans font-medium text-xs mb-0.5">
                    On-Chain Keccak-256 Hash:
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
                >
                  Fetch from IPFS & Compute Keccak-256
                </Button>
              </div>

              {descVerifyState === 'MATCH' && descResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-950 space-y-2">
                  <div className="font-bold flex items-center justify-between text-emerald-800">
                    <span>✓ Cryptographic Match Confirmed</span>
                    <Badge variant="success" className="text-[10px]">
                      {descResult.isFromNetwork ? 'IPFS Network Gateways' : 'Local Storage Cache'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-emerald-800">
                    The off-chain payload retrieved via CID was hashed in your browser using
                    Keccak-256. The computed hash matches the on-chain commitment perfectly.
                  </p>
                  <div className="p-2.5 bg-white/80 rounded border border-emerald-200 space-y-1 text-[11px]">
                    <span className="font-semibold text-slate-700 block">Verified Text Content:</span>
                    <p className="text-slate-900 whitespace-pre-wrap">
                      {descResult.payload?.description || descResult.payload?.text || JSON.stringify(descResult.payload)}
                    </p>
                  </div>
                </div>
              )}

              {descVerifyState === 'MISMATCH' && descResult && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-lg text-rose-950 space-y-2">
                  <div className="font-bold text-rose-800">⚠️ Hash Mismatch Detected!</div>
                  <p className="text-[11px] text-rose-800">
                    The computed hash of the IPFS content ({descResult.computed}) does NOT match
                    the immutable on-chain hash ({grievance.descriptionHash}).
                  </p>
                </div>
              )}

              {descVerifyState === 'FAILED' && descResult && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs">
                  Could not retrieve content from IPFS: {descResult.error}
                </div>
              )}
            </div>
          </Card>

          {/* Resolutions Verification Section */}
          {resolutions.length > 0 && (
            <Card
              title={`Resolution Verification (${resolutions.length})`}
              subtitle="Verify proposed solutions and citizen determinations"
            >
              <div className="space-y-4">
                {resolutions.map((r) => {
                  const vState = resVerifyState[r.resolutionId];
                  return (
                    <div
                      key={r.resolutionId}
                      className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2 text-xs"
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
                          size="sm"
                          loading={vState?.state === 'VERIFYING'}
                          onClick={() => handleVerifyResolution(r)}
                        >
                          Verify Resolution Hash
                        </Button>
                      </div>

                      {vState?.state === 'MATCH' && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-900 text-xs space-y-1">
                          <span className="font-bold text-emerald-800">✓ Verified Resolution Payload:</span>
                          <p className="whitespace-pre-wrap text-slate-800">
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
