import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { formatTimestamp, shortenAddress } from '../../utils/formatters';
import {
  fetchEvidenceList,
  addEvidence,
  revokeEvidence,
} from '../../services/grievanceService';
import { uploadFileToIpfs, uploadToIpfs } from '../../services/ipfs';

const EVIDENCE_TYPE_LABELS = {
  0: 'Document',
  1: 'Image',
  2: 'Video',
  3: 'Audio',
  4: 'Other',
};

export function EvidencePanel({
  grievance,
  runner,
  signer,
  userAddress,
  isOfficerOrAdmin,
}) {
  const [evidenceList, setEvidenceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Add form fields
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState(0); // Document
  const [uploadMode, setUploadMode] = useState('file'); // 'file' | 'text'
  const [selectedFile, setSelectedFile] = useState(null);
  const [textContent, setTextContent] = useState('');

  // Revoke state
  const [revokingId, setRevokingId] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokingLoading, setRevokingLoading] = useState(false);

  const loadEvidence = useCallback(async () => {
    if (!grievance?.id || !runner) return;
    try {
      setLoading(true);
      const list = await fetchEvidenceList(runner, grievance.id);
      setEvidenceList(list);
    } catch (err) {
      console.error('Failed to load evidence list:', err);
    } finally {
      setLoading(false);
    }
  }, [grievance?.id, runner]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  const isCitizen =
    grievance?.citizen &&
    userAddress &&
    grievance.citizen.toLowerCase() === userAddress.toLowerCase();
  const isAssignedOfficer =
    grievance?.assignedOfficer &&
    userAddress &&
    grievance.assignedOfficer.toLowerCase() === userAddress.toLowerCase();

  // Any authorized actor: citizen owner, assigned officer, or admin
  const canAddEvidence = isCitizen || isAssignedOfficer || isOfficerOrAdmin;

  const handleAddEvidence = async (e) => {
    e.preventDefault();
    if (!evidenceTitle.trim()) {
      setError('Evidence title is required.');
      return;
    }

    try {
      setAddingEvidence(true);
      setError(null);
      setSuccessMsg('');

      let fileCid = '';
      let fileHash = '';

      if (uploadMode === 'file') {
        if (!selectedFile) {
          throw new Error('Please select a file to upload.');
        }
        const res = await uploadFileToIpfs(selectedFile);
        fileCid = res.cid;
        fileHash = res.contentHash;
      } else {
        if (!textContent.trim()) {
          throw new Error('Please enter evidence documentation text.');
        }
        const payload = {
          title: evidenceTitle.trim(),
          content: textContent.trim(),
          type: evidenceType,
          submitter: userAddress,
          timestamp: Math.floor(Date.now() / 1000),
        };
        const res = await uploadToIpfs(payload);
        fileCid = res.cid;
        fileHash = res.contentHash;
      }

      await addEvidence(
        signer,
        grievance.id,
        Number(evidenceType),
        fileCid,
        fileHash,
        evidenceTitle.trim()
      );

      setSuccessMsg('Evidence submitted and anchored on-chain.');
      setEvidenceTitle('');
      setSelectedFile(null);
      setTextContent('');
      setShowAddForm(false);
      await loadEvidence();
    } catch (err) {
      setError(err.message || 'Failed to submit evidence.');
    } finally {
      setAddingEvidence(false);
    }
  };

  const handleRevoke = async (evidenceId) => {
    if (!revokeReason.trim()) {
      setError('Please provide a reason for revoking this evidence item.');
      return;
    }
    try {
      setRevokingLoading(true);
      setError(null);
      setSuccessMsg('');
      await revokeEvidence(signer, grievance.id, evidenceId, revokeReason.trim());
      setSuccessMsg(`Evidence #${evidenceId} has been revoked.`);
      setRevokingId(null);
      setRevokeReason('');
      await loadEvidence();
    } catch (err) {
      setError(err.message || 'Failed to revoke evidence.');
    } finally {
      setRevokingLoading(false);
    }
  };

  return (
    <Card
      title={`Case Evidence Vault (${evidenceList.length})`}
      subtitle="Dual-referenced decentralized IPFS files & cryptographic commitments"
    >
      <div className="space-y-4">
        {error && (
          <Alert variant="danger" title="Error">
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert variant="success" title="Success">
            {successMsg}
          </Alert>
        )}

        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500">
            {evidenceList.length === 0
              ? 'No evidence items submitted yet.'
              : `${evidenceList.length} evidence record(s) on file.`}
          </span>
          {canAddEvidence && !showAddForm && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              + Submit Evidence
            </Button>
          )}
        </div>

        {/* Add Evidence Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddEvidence}
            className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
          >
            <h4 className="font-semibold text-xs text-slate-800">
              Submit Case Evidence
            </h4>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Evidence Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Photographic proof of water contamination"
                value={evidenceTitle}
                onChange={(e) => setEvidenceTitle(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Evidence Classification *
                </label>
                <select
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value={0}>Document (PDF, Office, TXT)</option>
                  <option value={1}>Image (JPG, PNG, WEBP)</option>
                  <option value={2}>Video (MP4, MOV)</option>
                  <option value={3}>Audio (MP3, WAV)</option>
                  <option value={4}>Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Submission Mode *
                </label>
                <div className="flex items-center gap-3 pt-1 text-xs">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="uploadMode"
                      checked={uploadMode === 'file'}
                      onChange={() => setUploadMode('file')}
                    />
                    Upload File
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="uploadMode"
                      checked={uploadMode === 'text'}
                      onChange={() => setUploadMode('text')}
                    />
                    Text / Memo
                  </label>
                </div>
              </div>
            </div>

            {uploadMode === 'file' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Choose File *
                </label>
                <input
                  type="file"
                  required
                  onChange={(e) => setSelectedFile(e.target.files[0] || null)}
                  className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Evidence Statement / Written Record *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Type official statement, reference notes, or transcript..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={addingEvidence}
              >
                Anchor Evidence on Blockchain
              </Button>
            </div>
          </form>
        )}

        {/* Evidence Items List */}
        {loading ? (
          <div className="py-4 text-center text-xs text-slate-500">
            Loading evidence catalog...
          </div>
        ) : (
          <div className="space-y-3">
            {evidenceList.map((item) => {
              const isSubmitter =
                userAddress && item.submitter.toLowerCase() === userAddress.toLowerCase();
              const canRevoke = !item.isRevoked && (isSubmitter || isOfficerOrAdmin);

              return (
                <div
                  key={item.evidenceId}
                  className={`p-3 bg-white border rounded-lg space-y-2 text-xs ${
                    item.isRevoked ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">
                        {item.title || `Evidence #${item.evidenceId}`}
                      </span>
                      <Badge variant="neutral" className="text-[10px]">
                        {EVIDENCE_TYPE_LABELS[item.evidenceType] || 'File'}
                      </Badge>
                      {item.isRevoked ? (
                        <Badge variant="danger" className="text-[10px]">
                          Revoked
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-[10px]">
                          Active
                        </Badge>
                      )}
                    </div>
                    <span className="text-slate-400 font-mono text-[11px]">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
                    <span>
                      Submitted by:{' '}
                      <span className="font-mono text-slate-800">
                        {shortenAddress(item.submitter, 6)}
                      </span>
                      {isSubmitter && ' (You)'}
                    </span>
                    {canRevoke && revokingId !== item.evidenceId && (
                      <button
                        type="button"
                        onClick={() => setRevokingId(item.evidenceId)}
                        className="text-rose-600 hover:text-rose-800 text-[11px] font-medium underline"
                      >
                        Revoke Evidence
                      </button>
                    )}
                  </div>

                  {/* Dual reference display */}
                  <div className="p-2 bg-slate-50 rounded border border-slate-100 font-mono text-[10px] space-y-0.5 text-slate-600 break-all">
                    <div>
                      <span className="text-slate-400">IPFS CID:</span> {item.fileCid}
                    </div>
                    <div>
                      <span className="text-slate-400">Hash:</span> {item.fileHash}
                    </div>
                  </div>

                  {/* Revocation form */}
                  {revokingId === item.evidenceId && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded space-y-2 mt-2">
                      <h5 className="font-semibold text-rose-900 text-xs">
                        Revoke Evidence #{item.evidenceId}
                      </h5>
                      <input
                        type="text"
                        placeholder="Reason for revocation (e.g. invalid document, superseded)..."
                        value={revokeReason}
                        onChange={(e) => setRevokeReason(e.target.value)}
                        className="w-full text-xs px-2.5 py-1.5 border border-slate-300 rounded outline-none bg-white"
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setRevokingId(null);
                            setRevokeReason('');
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          loading={revokingLoading}
                          onClick={() => handleRevoke(item.evidenceId)}
                        >
                          Confirm Revoke
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
