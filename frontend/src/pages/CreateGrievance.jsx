import React, { useState, useEffect, useMemo } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useRoles } from '../hooks/useRoles';
import { useRouter } from '../hooks/useRouter';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import { CONTRACT_ADDRESSES, isContractConfigured } from '../contracts/addresses';
import {
  PRIORITIES,
  PRIORITY_METADATA,
  fetchActiveDepartments,
  fetchActiveCategories,
  sendGrievanceTransaction,
  waitForGrievanceConfirmation,
  verifyAuditRecord,
  parseContractError,
} from '../services/grievanceService';
import {
  createCanonicalDescriptionPayload,
  computeContentHash,
  uploadText,
  uploadFile,
} from '../services/ipfs';
import { GrievanceSubmissionSuccess } from './GrievanceSubmissionSuccess';

export function CreateGrievance() {
  const { address, signer, provider, isConnected, chainId, networkName } = useWallet();
  const { isRegistered, registerCitizen, refreshRoles } = useRoles();
  const { navigate } = useRouter();

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState(PRIORITIES.MEDIUM);

  // Evidence state
  const [_evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceInfo, setEvidenceInfo] = useState(null);
  const [isHashingEvidence, setIsHashingEvidence] = useState(false);

  // Blockchain entity data
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoadingEntities, setIsLoadingEntities] = useState(true);

  // Pipeline transaction states: 'IDLE' | 'VALIDATING' | 'UPLOADING' | 'AWAITING_WALLET' | 'MINING' | 'VERIFYING_AUDIT' | 'SUCCESS' | 'ERROR'
  const [txState, setTxState] = useState('IDLE');
  const [txMessage, setTxMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState(null);
  const [pendingTxHash, setPendingTxHash] = useState(null);

  // Registration state
  const [isSelfRegistering, setIsSelfRegistering] = useState(false);

  // Success result
  const [submissionResult, setSubmissionResult] = useState(null);

  // Title byte count (Solidity limit: 200 bytes)
  const titleBytes = useMemo(() => {
    return new TextEncoder().encode(title).length;
  }, [title]);

  const isTitleValid = title.trim().length > 0 && titleBytes <= 200;

  // Load real departments and categories from DepartmentManager
  useEffect(() => {
    let active = true;

    async function loadData() {
      if (!isContractConfigured('DepartmentManager')) {
        setIsLoadingEntities(false);
        return;
      }

      setIsLoadingEntities(true);
      try {
        const runner = provider || signer;
        const [depts, cats] = await Promise.all([
          fetchActiveDepartments(runner),
          fetchActiveCategories(runner),
        ]);

        if (active) {
          setDepartments(depts);
          setCategories(cats);

          if (depts.length > 0) {
            setDepartmentId(String(depts[0].id));
          }
          if (cats.length > 0) {
            setCategoryId(String(cats[0].id));
          }
        }
      } catch (err) {
        console.error('Failed to load organizational entities:', err);
        if (active) {
          setErrorMessage('Could not load active departments or categories from DepartmentManager contract.');
        }
      } finally {
        if (active) {
          setIsLoadingEntities(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [provider, signer]);

  // Handle optional evidence file selection
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setEvidenceFile(null);
      setEvidenceInfo(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Evidence files are limited to 5MB for network optimization.');
      e.target.value = '';
      return;
    }

    setEvidenceFile(file);
    setIsHashingEvidence(true);
    try {
      const uploadRes = await uploadFile(file);
      setEvidenceInfo({
        name: file.name,
        size: file.size,
        type: file.type,
        cid: uploadRes.cid,
        hash: uploadRes.contentHash,
      });
    } catch (err) {
      console.error('Evidence upload error:', err);
      setErrorMessage('Could not process evidence artifact.');
      setEvidenceFile(null);
      setEvidenceInfo(null);
    } finally {
      setIsHashingEvidence(false);
    }
  };

  // Self-register as citizen
  const handleRegister = async () => {
    setIsSelfRegistering(true);
    setErrorMessage(null);
    try {
      await registerCitizen();
      await refreshRoles();
    } catch (err) {
      console.error('Registration failed:', err);
      setErrorMessage(parseContractError(err));
    } finally {
      setIsSelfRegistering(false);
    }
  };

  // Main Submission Pipeline
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Preflight Validation
    if (!isConnected || !signer) {
      setErrorMessage('Please connect your MetaMask wallet to submit a grievance on-chain.');
      return;
    }

    if (!isTitleValid) {
      setErrorMessage('Grievance title must be between 1 and 200 UTF-8 bytes.');
      return;
    }

    if (!description.trim()) {
      setErrorMessage('Grievance detailed description is required.');
      return;
    }

    if (!departmentId || !categoryId) {
      setErrorMessage('Please select a valid responsible Department and Category.');
      return;
    }

    try {
      // 2. State: VALIDATING
      setTxState('VALIDATING');
      setTxMessage('Validating grievance inputs against smart contract requirements...');
      setPendingTxHash(null);

      const timestamp = Math.floor(Date.now() / 1000);
      const canonicalPayload = createCanonicalDescriptionPayload({
        title,
        description,
        departmentId: Number(departmentId),
        categoryId: Number(categoryId),
        priority: Number(priority),
        timestamp,
      });

      // 3. State: UPLOADING to IPFS
      setTxState('UPLOADING');
      setTxMessage('Uploading canonical grievance information to IPFS and generating CIDv1...');
      const ipfsResult = await uploadText(canonicalPayload);

      // Verify keccak-256 hash commitment
      const localHash = computeContentHash(canonicalPayload);
      if (localHash !== ipfsResult.contentHash) {
        throw new Error('Cryptographic content hash mismatch during IPFS payload preparation.');
      }

      // 4. State: AWAITING_WALLET
      setTxState('AWAITING_WALLET');
      setTxMessage('Waiting for wallet confirmation... Please approve the transaction in MetaMask.');

      const { tx, grievanceContract } = await sendGrievanceTransaction(signer, {
        categoryId: Number(categoryId),
        departmentId: Number(departmentId),
        priority: Number(priority),
        title: title.trim(),
        descriptionCid: ipfsResult.cid,
        descriptionHash: ipfsResult.contentHash,
      });

      // 5. State: MINING
      setPendingTxHash(tx.hash);
      setTxState('MINING');
      setTxMessage('Transaction broadcast to Ethereum Sepolia. Waiting for block confirmation...');

      const result = await waitForGrievanceConfirmation(tx, grievanceContract);

      // 6. State: VERIFYING_AUDIT
      setTxState('VERIFYING_AUDIT');
      setTxMessage(`Grievance #${result.grievanceId} confirmed in block #${result.blockNumber}! Verifying on-chain AuditTrail...`);

      const auditResult = await verifyAuditRecord(
        provider || signer,
        result.grievanceId,
        address,
        ipfsResult.contentHash
      );

      // 7. State: SUCCESS
      setTxState('SUCCESS');
      setSubmissionResult({
        grievanceId: result.grievanceId,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        citizenAddress: address,
        contractAddress: CONTRACT_ADDRESSES.GrievanceSystem,
        networkName,
        chainId,
        descriptionCid: ipfsResult.cid,
        descriptionHash: ipfsResult.contentHash,
        auditVerification: auditResult,
        ipfsPersisted: ipfsResult.persisted,
        gatewayUrl: ipfsResult.gatewayUrl,
        ipfsProvider: ipfsResult.provider,
      });
    } catch (err) {
      console.error('Submission pipeline error:', err);
      setTxState('ERROR');
      setPendingTxHash(null);
      setErrorMessage(parseContractError(err));
    }
  };

  // If already successfully submitted, render success page
  if (txState === 'SUCCESS' && submissionResult) {
    return <GrievanceSubmissionSuccess {...submissionResult} />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Page Header */}
      <div className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="primary" dot className="font-bold text-xs uppercase">
                Citizen Portal
              </Badge>
              <span className="text-xs text-slate-400 font-mono">
                Ethereum Sepolia ({chainId})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
              Submit Public Grievance
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Submit official grievances recorded immutably on Ethereum with IPFS CID dual-reference proofs.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/citizen')}
            className="font-bold shrink-0 self-start sm:self-auto"
          >
            ← Back to Citizen Portal
          </Button>
        </div>

        {/* 3-Step Guided Civic Flow Indicator */}
        <div className="grid grid-cols-3 gap-2 pt-6 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-700 font-bold">
            1. Classification
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-700 font-bold">
            2. Complaint Statement
          </div>
          <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-700 font-bold">
            3. On-Chain Commit
          </div>
        </div>
      </div>

      {/* Contract Not Deployed Alert */}
      {!isContractConfigured('GrievanceSystem') && (
        <Alert variant="warning" title="Contract Deployment Notice">
          The <code className="font-mono font-bold">GrievanceSystem</code> contract address is not configured.
          Deploy contracts to Ethereum Sepolia via Remix and set <code className="font-mono font-bold">VITE_GRIEVANCE_SYSTEM_ADDRESS</code> in <code className="font-mono">frontend/.env</code>.
        </Alert>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <Alert variant="danger" title="Submission Notice" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Transaction Progress Banner */}
      {txState !== 'IDLE' && txState !== 'ERROR' && (
        <div
          className={`p-5 rounded-2xl border space-y-2.5 animate-fade-in ${
            txState === 'VERIFYING_AUDIT'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : txState === 'AWAITING_WALLET'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-blue-50 border-blue-200 text-blue-950'
          }`}
        >
          <div className="flex items-center gap-3">
            {txState === 'AWAITING_WALLET' ? (
              <span className="text-2xl shrink-0">🦊</span>
            ) : txState === 'VERIFYING_AUDIT' ? (
              <span className="text-2xl shrink-0">✓</span>
            ) : (
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full shrink-0" />
            )}
            <span className="text-sm font-bold">{txMessage}</span>
          </div>
          <div className="text-xs pl-8 space-y-1 text-slate-700">
            <div>
              State: <span className="font-mono font-bold uppercase">{txState}</span> — Please keep your browser open.
            </div>
            {pendingTxHash && (
              <div className="font-mono text-[11px] text-blue-700 break-all">
                Transaction Hash: {pendingTxHash}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unregistered Citizen Notice */}
      {isConnected && !isRegistered && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-bold text-amber-900 block">Citizen Identity Status</span>
            <span className="text-amber-800">
              Permissionless intake is active. You can submit grievances directly, or register your profile on-chain.
            </span>
          </div>
          <Button
            variant="secondary"
            size="xs"
            loading={isSelfRegistering}
            onClick={handleRegister}
            className="shrink-0 font-bold"
          >
            Optional: Register Profile
          </Button>
        </div>
      )}

      {/* Main Grievance Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Classification & Jurisdiction */}
        <Card
          title="1. Department Jurisdiction & Classification"
          subtitle="Select the responsible public administration department and urgency priority tier"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Department */}
            <div>
              <label htmlFor="department" className="block text-xs font-bold text-slate-700 mb-1.5">
                Responsible Department <span className="text-rose-500">*</span>
              </label>
              {isLoadingEntities ? (
                <div className="text-xs text-slate-400 py-2">Loading departments...</div>
              ) : departments.length > 0 ? (
                <select
                  id="department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  required
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (#{d.id})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-rose-600 font-semibold py-2">
                  No active departments found.
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-xs font-bold text-slate-700 mb-1.5">
                Grievance Category <span className="text-rose-500">*</span>
              </label>
              {isLoadingEntities ? (
                <div className="text-xs text-slate-400 py-2">Loading categories...</div>
              ) : categories.length > 0 ? (
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none"
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-rose-600 font-semibold py-2">
                  No active categories found.
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-xs font-bold text-slate-700 mb-1.5">
                Urgency Priority Tier <span className="text-rose-500">*</span>
              </label>
              <select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white outline-none font-semibold"
              >
                <option value={PRIORITIES.LOW}>Low Priority</option>
                <option value={PRIORITIES.MEDIUM}>Medium Priority</option>
                <option value={PRIORITIES.HIGH}>High Priority</option>
                <option value={PRIORITIES.CRITICAL}>Critical Priority</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Section 2: Grievance Statement */}
        <Card
          title="2. Grievance Statement & Details"
          subtitle="Provide a descriptive title and comprehensive observations for the field officer"
        >
          <div className="space-y-4">
            {/* Title */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label htmlFor="title" className="text-xs font-bold text-slate-700">
                  Grievance Summary Title <span className="text-rose-500">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    titleBytes > 200 ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {titleBytes} / 200 bytes
                </span>
              </div>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Overflowing garbage and blocked drainage on Main Street"
                disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Stored on-chain in GrievanceSystem.sol for summary indexing and event logging.
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-bold text-slate-700 mb-1.5">
                Detailed Complaint Statement <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in full detail, including location, observations, timeline, and requested governmental remediation..."
                disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all resize-none"
                required
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Encoded into a canonical JSON payload, stored on IPFS, and committed via its cryptographic Keccak-256 hash.
              </p>
            </div>
          </div>
        </Card>

        {/* Section 3: Supporting Evidence */}
        <Card
          title="3. Supporting Evidence (Optional)"
          subtitle="Attach photographs or documents to be permanently bound to this case via IPFS"
        >
          <div className="space-y-3">
            <input
              type="file"
              onChange={handleFileChange}
              disabled={txState !== 'IDLE' && txState !== 'ERROR'}
              className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer cursor-pointer"
            />
            {isHashingEvidence && (
              <span className="text-xs text-blue-600 font-semibold block">
                Uploading to IPFS and calculating cryptographic hash...
              </span>
            )}
            {evidenceInfo && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1 text-emerald-950 font-mono text-[11px]">
                <div>File: <strong className="font-sans">{evidenceInfo.name}</strong></div>
                <div>IPFS CID: {evidenceInfo.cid}</div>
                <div>SHA-256 Hash: {evidenceInfo.hash}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Submit Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <span className="text-xs text-slate-400">
            Submission requires MetaMask gas fee confirmation on Ethereum Sepolia.
          </span>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={!isConnected || !isTitleValid || !description.trim() || (txState !== 'IDLE' && txState !== 'ERROR')}
            className="w-full sm:w-auto font-bold shadow-md"
          >
            {txState === 'IDLE' || txState === 'ERROR'
              ? 'Commit Grievance On-Chain'
              : 'Processing Submission...'}
          </Button>
        </div>
      </form>
    </div>
  );
}
