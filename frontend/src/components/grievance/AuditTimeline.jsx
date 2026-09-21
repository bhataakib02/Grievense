import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { formatTimestamp, shortenAddress } from '../../utils/formatters';
import { fetchAuditsByTarget } from '../../services/auditService';

export function AuditTimeline({ grievanceId, runner }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAudits = useCallback(async () => {
    if (!grievanceId || !runner) return;
    try {
      setLoading(true);
      const list = await fetchAuditsByTarget(runner, grievanceId);
      // Sort in chronological order (or reverse if desired)
      setAudits(list);
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoading(false);
    }
  }, [grievanceId, runner]);

  useEffect(() => {
    loadAudits();
  }, [loadAudits]);

  return (
    <Card
      title={`Immutable Audit Trail (${audits.length})`}
      subtitle="Cryptographically sealed, append-only chronological log from AuditTrail.sol"
    >
      {loading ? (
        <div className="py-4 text-center text-xs text-slate-500">
          Loading blockchain audit logs...
        </div>
      ) : audits.length === 0 ? (
        <p className="text-xs text-slate-500 py-2">
          No audit entries recorded directly targeting Grievance #{grievanceId}.
        </p>
      ) : (
        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
          {audits.map((a, idx) => (
            <div key={a.id || idx} className="relative text-xs space-y-1">
              {/* Bullet circle */}
              <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white shadow-xs" />

              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{a.actionName}</span>
                  <Badge variant="neutral" className="text-[10px] font-mono">
                    Entry #{a.id}
                  </Badge>
                </div>
                <span className="text-slate-400 font-mono text-[11px]">
                  {formatTimestamp(a.timestamp)}
                </span>
              </div>

              <div className="text-slate-600 text-[11px]">
                Actor:{' '}
                <span className="font-mono text-slate-800 font-medium">
                  {shortenAddress(a.actor, 6)}
                </span>
              </div>

              {a.detailsHash && a.detailsHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
                <div className="text-[10px] text-slate-400 font-mono break-all pt-0.5">
                  Details Hash: {a.detailsHash}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
