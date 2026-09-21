import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import {
  STATUSES,
  acceptResolution,
  rejectResolution,
  reopenGrievance,
  closeGrievance,
} from '../../services/grievanceService';

export function CitizenActionBar({ grievance, signer, userAddress, onActionSuccess }) {
  const [loadingAction, setLoadingAction] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Rejection modal / form state
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Reopen modal / form state
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  if (!grievance || !signer || !userAddress) return null;

  const isCitizenOwner =
    grievance.citizen && grievance.citizen.toLowerCase() === userAddress.toLowerCase();

  if (!isCitizenOwner) return null;

  const currentStatus = Number(grievance.status);

  const isAwaitingReview =
    currentStatus === STATUSES.CITIZEN_REVIEW ||
    currentStatus === STATUSES.RESOLUTION_PROPOSED;
  const isRejected = currentStatus === STATUSES.REJECTED;
  const isAccepted = currentStatus === STATUSES.ACCEPTED;

  if (!isAwaitingReview && !isRejected && !isAccepted) {
    return null;
  }

  const handleAccept = async () => {
    try {
      setLoadingAction('accept');
      setError(null);
      setSuccessMsg('');
      await acceptResolution(signer, grievance.id);
      setSuccessMsg('Resolution accepted! Thank you for verifying the outcome.');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to accept resolution.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setError('Please provide a specific reason for rejecting the resolution.');
      return;
    }
    try {
      setLoadingAction('reject');
      setError(null);
      setSuccessMsg('');
      await rejectResolution(signer, grievance.id, rejectReason.trim());
      setSuccessMsg('Resolution rejected. You may now choose to reopen the grievance.');
      setShowRejectForm(false);
      setRejectReason('');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to reject resolution.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleReopen = async (e) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setError('Please state your justification for reopening the grievance.');
      return;
    }
    try {
      setLoadingAction('reopen');
      setError(null);
      setSuccessMsg('');
      await reopenGrievance(signer, grievance.id, reopenReason.trim());
      setSuccessMsg('Grievance reopened successfully! Returned for further handling.');
      setShowReopenForm(false);
      setReopenReason('');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to reopen grievance.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleClose = async () => {
    try {
      setLoadingAction('close');
      setError(null);
      setSuccessMsg('');
      await closeGrievance(signer, grievance.id);
      setSuccessMsg('Grievance marked permanently CLOSED.');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to close grievance.');
    } finally {
      setLoadingAction('');
    }
  };

  return (
    <Card
      title="Citizen Action Portal"
      subtitle="Verify outcome and direct the final grievance status"
      className="border-emerald-200 bg-emerald-50/20"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="danger" title="Citizen Action Error">
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert variant="success" title="Action Recorded">
            {successMsg}
          </Alert>
        )}

        {isAwaitingReview && (
          <div>
            <p className="text-xs text-slate-600 mb-3">
              A resolution has been proposed by the assigned officer. Please inspect the
              resolution details below and confirm whether the issue was resolved to your
              satisfaction:
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                loading={loadingAction === 'accept'}
                onClick={handleAccept}
              >
                Accept Resolution
              </Button>
              <Button
                variant="danger"
                onClick={() => setShowRejectForm(true)}
              >
                Reject Resolution
              </Button>
            </div>
          </div>
        )}

        {isRejected && (
          <div>
            <p className="text-xs text-slate-600 mb-3">
              This proposed resolution was rejected. You have the right to reopen the grievance
              to require the department to investigate further.
            </p>
            {!showReopenForm && (
              <Button
                variant="warning"
                onClick={() => setShowReopenForm(true)}
              >
                Reopen Grievance
              </Button>
            )}
          </div>
        )}

        {isAccepted && (
          <div>
            <p className="text-xs text-slate-600 mb-3">
              You accepted the resolution. You can now permanently close this grievance record.
            </p>
            <Button
              variant="primary"
              loading={loadingAction === 'close'}
              onClick={handleClose}
            >
              Close Grievance Permanently
            </Button>
          </div>
        )}

        {/* Rejection Form */}
        {showRejectForm && (
          <form
            onSubmit={handleReject}
            className="p-4 bg-white border border-rose-200 rounded-lg space-y-3 mt-3"
          >
            <h4 className="font-semibold text-rose-900 text-sm">
              State Rejection Reason
            </h4>
            <textarea
              required
              rows={3}
              placeholder="Explain specifically why the proposed solution does not resolve the issue..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-rose-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowRejectForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                loading={loadingAction === 'reject'}
              >
                Confirm Rejection
              </Button>
            </div>
          </form>
        )}

        {/* Reopen Form */}
        {showReopenForm && (
          <form
            onSubmit={handleReopen}
            className="p-4 bg-white border border-amber-200 rounded-lg space-y-3 mt-3"
          >
            <h4 className="font-semibold text-amber-900 text-sm">
              Reopen Justification
            </h4>
            <textarea
              required
              rows={3}
              placeholder="State what additional investigation or remediation is required..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-amber-500 outline-none"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowReopenForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="warning"
                size="sm"
                loading={loadingAction === 'reopen'}
              >
                Submit Reopening Request
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
