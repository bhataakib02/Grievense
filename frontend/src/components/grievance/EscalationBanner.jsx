import React, { useState, useEffect, useCallback } from 'react';
import { Alert } from '../common/Alert';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { formatTimestamp, shortenAddress } from '../../utils/formatters';
import {
  checkIsSLABreached,
  checkCanEscalate,
  checkCanResolveEscalation,
  escalateGrievance,
  resolveEscalation,
  fetchAllEscalationRecords,
} from '../../services/escalationService';
import { STATUSES } from '../../services/grievanceService';

export function EscalationBanner({
  grievance,
  runner,
  signer,
  userAddress,
  onActionSuccess,
}) {
  const [isBreached, setIsBreached] = useState(false);
  const [canEscalateNow, setCanEscalateNow] = useState(false);
  const [canResolveNow, setCanResolveNow] = useState(false);
  const [records, setRecords] = useState([]);
  const [loadingAction, setLoadingAction] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const loadEscalationStatus = useCallback(async () => {
    if (!grievance?.id || !runner) return;
    try {
      const [breached, eligible, canRes, hist] = await Promise.all([
        checkIsSLABreached(runner, grievance.id),
        checkCanEscalate(runner, grievance.id),
        userAddress
          ? checkCanResolveEscalation(runner, grievance.id, userAddress)
          : false,
        fetchAllEscalationRecords(runner, grievance.id),
      ]);
      setIsBreached(breached);
      setCanEscalateNow(eligible);
      setCanResolveNow(canRes);
      setRecords(hist);
    } catch (err) {
      console.warn('Escalation status check failed:', err);
    }
  }, [grievance?.id, runner, userAddress]);

  useEffect(() => {
    loadEscalationStatus();
  }, [loadEscalationStatus]);

  const handleEscalate = async () => {
    try {
      setLoadingAction('escalate');
      setError(null);
      setSuccessMsg('');
      await escalateGrievance(signer, grievance.id);
      setSuccessMsg('Grievance successfully escalated on-chain due to SLA breach.');
      if (onActionSuccess) onActionSuccess();
      await loadEscalationStatus();
    } catch (err) {
      setError(err.message || 'Failed to escalate grievance.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleResolve = async () => {
    try {
      setLoadingAction('resolve');
      setError(null);
      setSuccessMsg('');
      await resolveEscalation(signer, grievance.id);
      setSuccessMsg('Escalation resolved! Grievance returned to UNDER_INVESTIGATION.');
      if (onActionSuccess) onActionSuccess();
      await loadEscalationStatus();
    } catch (err) {
      setError(err.message || 'Failed to resolve escalation.');
    } finally {
      setLoadingAction('');
    }
  };

  const isEscalatedStatus = Number(grievance?.status) === STATUSES.ESCALATED;

  if (!isBreached && !canEscalateNow && !isEscalatedStatus && records.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="danger" title="Escalation Error">
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert variant="success" title="Escalation Update">
          {successMsg}
        </Alert>
      )}

      {/* SLA Breach Warning (when under investigation) */}
      {canEscalateNow && !isEscalatedStatus && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-rose-900 text-sm">
                ⚠️ SLA Breach Detected
              </span>
              <Badge variant="danger">Deadline Expired</Badge>
            </div>
            <p className="text-xs text-rose-800 mt-1">
              This grievance has breached its on-chain SLA resolution window. Any party
              is authorized to trigger formal escalation.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            loading={loadingAction === 'escalate'}
            onClick={handleEscalate}
            className="shrink-0 font-semibold"
          >
            Trigger SLA Escalation
          </Button>
        </div>
      )}

      {/* Escalated Status Banner */}
      {isEscalatedStatus && (
        <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-950 text-sm">
                🚨 Case Escalated to Administrative Oversight
              </span>
              <Badge variant="danger">ESCALATED</Badge>
            </div>
            <p className="text-xs text-amber-900 mt-1">
              Active handling is paused pending administrative review and intervention.
            </p>
          </div>
          {canResolveNow && (
            <Button
              variant="primary"
              size="sm"
              loading={loadingAction === 'resolve'}
              onClick={handleResolve}
              className="shrink-0 font-semibold"
            >
              Resolve Escalation & Resume
            </Button>
          )}
        </div>
      )}

      {/* Historical Escalation Records if any */}
      {records.length > 0 && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
          <div className="font-semibold text-slate-700 flex items-center justify-between">
            <span>Escalation History ({records.length} record(s))</span>
          </div>
          <div className="divide-y divide-slate-200">
            {records.map((rec, i) => (
              <div key={i} className="py-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between text-slate-600">
                  <span>
                    Escalated by: <span className="font-mono text-slate-800">{shortenAddress(rec.escalatedBy, 5)}</span>
                  </span>
                  <span className="font-mono text-slate-400">{formatTimestamp(rec.escalatedAt)}</span>
                </div>
                {rec.resolvedBy && rec.resolvedBy !== '0x0000000000000000000000000000000000000000' ? (
                  <div className="flex items-center justify-between text-emerald-700 font-medium">
                    <span>
                      Resolved by: <span className="font-mono">{shortenAddress(rec.resolvedBy, 5)}</span>
                    </span>
                    <span className="font-mono text-slate-400">{formatTimestamp(rec.resolvedAt)}</span>
                  </div>
                ) : (
                  <span className="text-amber-700 font-medium">Pending administrative resolution</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
