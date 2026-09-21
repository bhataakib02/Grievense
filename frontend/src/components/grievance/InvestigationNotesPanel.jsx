import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { formatTimestamp, shortenAddress } from '../../utils/formatters';
import {
  fetchInvestigationNotes,
  addInvestigationNote,
} from '../../services/grievanceService';
import { uploadToIpfs, fetchFromIpfs } from '../../services/ipfs';

export function InvestigationNotesPanel({
  grievance,
  runner,
  signer,
  userAddress,
  isOfficerOrAdmin,
}) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Resolved note texts from IPFS
  const [resolvedTexts, setResolvedTexts] = useState({});

  const loadNotes = useCallback(async () => {
    if (!grievance?.id || !runner) return;
    try {
      setLoading(true);
      const list = await fetchInvestigationNotes(runner, grievance.id);
      setNotes(list);

      // Asynchronously fetch notes from IPFS
      list.forEach(async (n) => {
        if (n.noteCid && !resolvedTexts[n.noteCid]) {
          try {
            const { content } = await fetchFromIpfs(n.noteCid);
            let text = content;
            try {
              const parsed = JSON.parse(content);
              text = parsed.note || parsed.text || content;
            } catch {
              // raw string
            }
            setResolvedTexts((prev) => ({ ...prev, [n.noteCid]: text }));
          } catch (e) {
            console.warn('Could not fetch note CID:', n.noteCid, e);
          }
        }
      });
    } catch (err) {
      console.error('Failed to load investigation notes:', err);
    } finally {
      setLoading(false);
    }
  }, [grievance?.id, runner]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) {
      setError('Investigation note content cannot be empty.');
      return;
    }
    try {
      setAddingNote(true);
      setError(null);
      setSuccessMsg('');

      const payload = {
        grievanceId: grievance.id,
        note: noteContent.trim(),
        author: userAddress,
        timestamp: Math.floor(Date.now() / 1000),
      };

      const { cid, contentHash } = await uploadToIpfs(payload);

      await addInvestigationNote(signer, grievance.id, cid, contentHash);
      setSuccessMsg('Investigation note permanently added on-chain.');
      setNoteContent('');
      setShowAddForm(false);
      await loadNotes();
    } catch (err) {
      setError(err.message || 'Failed to add investigation note.');
    } finally {
      setAddingNote(false);
    }
  };

  const isAssignedOfficer =
    grievance?.assignedOfficer &&
    userAddress &&
    grievance.assignedOfficer.toLowerCase() === userAddress.toLowerCase();

  const canAdd = isAssignedOfficer || isOfficerOrAdmin;

  return (
    <Card
      title={`Investigation Log (${notes.length})`}
      subtitle="Append-only immutable case notes recorded during investigation"
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
            {notes.length === 0
              ? 'No investigation notes recorded yet.'
              : `${notes.length} note(s) logged by investigation personnel.`}
          </span>
          {canAdd && !showAddForm && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              + Add Investigation Note
            </Button>
          )}
        </div>

        {/* Add Note Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddNote}
            className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
          >
            <h4 className="font-semibold text-xs text-slate-800">
              New Case Investigation Note
            </h4>
            <textarea
              required
              rows={3}
              placeholder="Record investigative findings, witness interviews, site visits, or departmental inquiries..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 outline-none bg-white"
            />
            <div className="flex justify-end gap-2">
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
                loading={addingNote}
              >
                Save to IPFS & Blockchain
              </Button>
            </div>
          </form>
        )}

        {/* Notes Listing */}
        {loading ? (
          <div className="py-4 text-center text-xs text-slate-500">
            Loading investigation log...
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n, idx) => (
              <div
                key={n.id || idx}
                className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5 text-xs shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral" className="text-[10px] font-mono font-bold">
                      Note #{idx + 1}
                    </Badge>
                    <span className="text-slate-500">By:</span>
                    <span className="font-mono text-slate-800">
                      {shortenAddress(n.officer, 5)}
                    </span>
                  </div>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {formatTimestamp(n.timestamp)}
                  </span>
                </div>

                <div className="pt-1 text-slate-800 whitespace-pre-wrap leading-relaxed">
                  {resolvedTexts[n.noteCid] || (
                    <span className="text-slate-400 italic">
                      Fetching note from IPFS ({n.noteCid})...
                    </span>
                  )}
                </div>

                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span>CID: {n.noteCid}</span>
                  <span>Hash: {n.noteHash?.slice(0, 16)}...</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
