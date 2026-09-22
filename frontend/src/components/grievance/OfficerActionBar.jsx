import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { STATUSES, startReview, startInvestigation, submitResolution } from '../../services/grievanceService';
import { uploadToIpfs } from '../../services/ipfs';

export function OfficerActionBar({ grievance, signer, userAddress, onActionSuccess }) {
  const [loadingAction, setLoadingAction] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Submit Resolution form state
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionTitle, setResolutionTitle] = useState('');
  const [resolutionDetails, setResolutionDetails] = useState('');

  if (!grievance || !signer || !userAddress) return null;

  const isAssigned =
    grievance.assignedOfficer &&
    grievance.assignedOfficer.toLowerCase() === userAddress.toLowerCase();

  // If not assigned officer, don't show officer action bar
  if (!isAssigned) return null;

  const currentStatus = Number(grievance.status);

  // Statuses where officer can take top-level lifecycle transitions:
  // 2: ASSIGNED -> startReview
  // 3: UNDER_REVIEW -> startInvestigation
  // 4: UNDER_INVESTIGATION -> submitResolution
  // 10: REOPENED -> startInvestigation (or startReview)
  const canStartReview = currentStatus === STATUSES.ASSIGNED;
  const canStartInvestigation =
    currentStatus === STATUSES.UNDER_REVIEW || currentStatus === STATUSES.REOPENED;
  const canSubmitResolution = currentStatus === STATUSES.UNDER_INVESTIGATION;

  if (!canStartReview && !canStartInvestigation && !canSubmitResolution) {
    return null;
  }

  const handleStartReview = async () => {
    try {
      setLoadingAction('review');
      setError(null);
      setSuccessMsg('');
      await startReview(signer, grievance.id);
      setSuccessMsg('Grievance transitioned to UNDER_REVIEW successfully.');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to start review.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleStartInvestigation = async () => {
    try {
      setLoadingAction('investigation');
      setError(null);
      setSuccessMsg('');
      await startInvestigation(signer, grievance.id);
      setSuccessMsg('Investigation started! Status transitioned to UNDER_INVESTIGATION.');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to start investigation.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleSubmitResolution = async (e) => {
    e.preventDefault();
    if (!resolutionTitle.trim()) {
      setError('Resolution title is required.');
      return;
    }
    if (!resolutionDetails.trim()) {
      setError('Resolution details / outcome summary is required.');
    }

    try {
      setLoadingAction('submit_resolution');
      setError(null);
      setSuccessMsg('');

      // Upload resolution payload to IPFS
      const payload = {
        grievanceId: grievance.id,
        title: resolutionTitle.trim(),
        details: resolutionDetails.trim(),
        proposedBy: userAddress,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const ipfsResult = await uploadToIpfs(payload);

      // 2. Submit on-chain proposal (GrievanceSystem.submitResolution)
      await submitResolution(
        signer,
        grievance.id,
        ipfsResult.cid,
        ipfsResult.contentHash
      );

      setSuccessMsg('Resolution submitted successfully! Grievance is now awaiting Citizen Review.');
      setShowResolutionForm(false);
      setResolutionTitle('');
      setResolutionDetails('');
      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      setError(err.message || 'Failed to submit resolution.');
    } finally {
      setLoadingAction('');
    }
  };

  return (
    <Card
      title="Officer Action Console"
      subtitle="Authorized actions for the assigned handling officer"
      className="border-amber-200 bg-amber-50/20"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="danger" title="Officer Action Error">
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert variant="success" title="Action Completed">
            {successMsg}
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {canStartReview && (
            <Button
              variant="primary"
              loading={loadingAction === 'review'}
              onClick={handleStartReview}
            >
              Start Formal Review
            </Button>
          )}

          {canStartInvestigation && (
            <Button
              variant="primary"
              loading={loadingAction === 'investigation'}
              onClick={handleStartInvestigation}
            >
              Begin Active Investigation
            </Button>
          )}

          {canSubmitResolution && !showResolutionForm && (
            <Button
              variant="primary"
              onClick={() => setShowResolutionForm(true)}
            >
              Propose Final Resolution
            </Button>
          )}
        </div>

        {/* Resolution Submission Form */}
        {showResolutionForm && (
          <form
            onSubmit={handleSubmitResolution}
            className="p-4 bg-white border border-amber-200 rounded-lg space-y-3 mt-3"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900 text-sm">
                Propose Resolution for Citizen Review
              </h4>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => setShowResolutionForm(false)}
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Resolution Title *
              </label>
              <input
                type="text"
                required
                maxLength={100}
                placeholder="e.g., Pothole repaired and inspected on 4th Ave"
                value={resolutionTitle}
                onChange={(e) => setResolutionTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Detailed Resolution Summary & Findings *
              </label>
              <textarea
                required
                rows={4}
                placeholder="Explain the corrective actions taken, inspections completed, and instructions for the citizen..."
                value={resolutionDetails}
                onChange={(e) => setResolutionDetails(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowResolutionForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={loadingAction === 'submit_resolution'}
              >
                Upload to IPFS & Submit Resolution
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
