import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { formatTimestamp, shortenAddress } from '../../utils/formatters';
import { fetchResolutionHistory } from '../../services/grievanceService';
import { fetchFromIpfs, computeContentHash } from '../../services/ipfs';

const RESOLUTION_STATUS_METADATA = {
  0: { label: 'Pending Citizen Review', variant: 'warning' },
  1: { label: 'Accepted', variant: 'success' },
  2: { label: 'Rejected', variant: 'danger' },
};

export function ResolutionPanel({ grievance, runner }) {
  const [resolutions, setResolutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvedPayloads, setResolvedPayloads] = useState({});
  const [verifyingId, setVerifyingId] = useState(null);
  const [verifyResults, setVerifyResults] = useState({});

  const loadResolutions = useCallback(async () => {
    if (!grievance?.id || !runner) return;
    try {
      setLoading(true);
      const list = await fetchResolutionHistory(runner, grievance.id);
      setResolutions(list);

      // Fetch off-chain resolution content
      list.forEach(async (r) => {
        if (r.resolutionCid && !resolvedPayloads[r.resolutionCid]) {
          try {
            const { content } = await fetchFromIpfs(r.resolutionCid);
            let parsed = content;
            try {
              parsed = JSON.parse(content);
            } catch {
              parsed = { details: content };
            }
            setResolvedPayloads((prev) => ({ ...prev, [r.resolutionCid]: parsed }));
          } catch (e) {
            console.warn('Could not fetch resolution CID:', r.resolutionCid, e);
          }
        }
      });
    } catch (err) {
      console.error('Failed to load resolutions:', err);
    } finally {
      setLoading(false);
    }
  }, [grievance?.id, runner]);

  useEffect(() => {
    loadResolutions();
  }, [loadResolutions]);

  const handleVerifyResolution = async (resItem) => {
    try {
      setVerifyingId(resItem.resolutionId);
      const { content } = await fetchFromIpfs(resItem.resolutionCid);
      const computed = computeContentHash(content);
      const match = computed.toLowerCase() === resItem.resolutionHash.toLowerCase();
      setVerifyResults((prev) => ({
        ...prev,
        [resItem.resolutionId]: {
          match,
          computed,
          message: match
            ? 'Cryptographic integrity verified! Payload matches on-chain hash.'
            : 'Integrity mismatch: Computed hash does not match on-chain commitment!',
        },
      }));
    } catch (err) {
      setVerifyResults((prev) => ({
        ...prev,
        [resItem.resolutionId]: {
          match: false,
          computed: '',
          message: `Failed to fetch from IPFS: ${err.message}`,
        },
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  if (!loading && resolutions.length === 0) {
    return null; // Don't show empty card if no resolutions have ever been proposed
  }

  return (
    <Card
      title={`Resolution Records (${resolutions.length})`}
      subtitle="Complete chronological audit of proposed resolutions & citizen determinations"
    >
      {loading ? (
        <div className="py-4 text-center text-xs text-slate-500">
          Loading resolution history...
        </div>
      ) : (
        <div className="space-y-4">
          {resolutions.map((r) => {
            const meta = RESOLUTION_STATUS_METADATA[r.status] || {
              label: 'Unknown',
              variant: 'neutral',
            };
            const payload = resolvedPayloads[r.resolutionCid];
            const vResult = verifyResults[r.resolutionId];

            return (
              <div
                key={r.resolutionId}
                className="p-4 bg-white border border-slate-200 rounded-lg space-y-3 text-xs shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      #{r.resolutionId} {r.title}
                    </span>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">
                    Proposed: {formatTimestamp(r.proposedAt)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between text-slate-500 text-[11px] gap-2">
                  <span>
                    Proposed by:{' '}
                    <span className="font-mono text-slate-800">
                      {shortenAddress(r.proposedBy, 6)}
                    </span>
                  </span>
                  {r.reviewedAt > 0 && (
                    <span>Reviewed: {formatTimestamp(r.reviewedAt)}</span>
                  )}
                </div>

                {/* Resolved IPFS payload text */}
                <div className="p-3 bg-slate-50 rounded border border-slate-200 space-y-1">
                  <span className="font-semibold text-slate-700 block text-[11px]">
                    Resolution Findings & Outcome Details:
                  </span>
                  <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                    {payload?.details || payload?.description || (
                      <span className="text-slate-400 italic">
                        Fetching resolution details from IPFS ({r.resolutionCid})...
                      </span>
                    )}
                  </p>
                </div>

                {/* Rejection reason if rejected */}
                {r.status === 2 && r.rejectionReason && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-900 space-y-1">
                    <span className="font-semibold text-rose-800 block text-[11px]">
                      Citizen Rejection Reason:
                    </span>
                    <p className="text-rose-800 leading-relaxed">{r.rejectionReason}</p>
                  </div>
                )}

                {/* Technical Hash Bindings */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
                  <div className="space-y-0.5 break-all">
                    <div>CID: {r.resolutionCid}</div>
                    <div>Hash: {r.resolutionHash}</div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={verifyingId === r.resolutionId}
                    onClick={() => handleVerifyResolution(r)}
                    className="self-start sm:self-auto text-[10px] py-1 px-2 shrink-0 font-sans"
                  >
                    Verify Resolution Hash
                  </Button>
                </div>

                {/* Verification result feedback */}
                {vResult && (
                  <div
                    className={`p-2 rounded text-[11px] font-sans ${
                      vResult.match
                        ? 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                        : 'bg-rose-50 border border-rose-300 text-rose-900'
                    }`}
                  >
                    <span className="font-bold">
                      {vResult.match ? '✓ Verified: ' : '⚠️ Mismatch: '}
                    </span>
                    {vResult.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
