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

    setEvidenceFile(file);
    setIsHashingEvidence(true);
    setErrorMessage(null);

    try {
      const result = await uploadFile(file);
      setEvidenceInfo(result);
    } catch (err) {
      console.error('Evidence file error:', err);
      setErrorMessage(err.message || 'Evidence processing failed.');
      setEvidenceFile(null);
      setEvidenceInfo(null);
    } finally {
      setIsHashingEvidence(false);
    }
  };

  // Self-register as citizen
  const handleRegister = async () => {
    if (!signer) {
      setErrorMessage('Please connect your wallet first.');
      return;
    }

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

  // Submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Pre-flight checks
    if (!isConnected || !signer || !address) {
      setErrorMessage('Wallet is not connected. Please connect MetaMask to submit.');
      return;
    }

    if (!isContractConfigured('GrievanceSystem')) {
      setErrorMessage('GrievanceSystem contract is not configured. Cannot send transaction.');
      return;
    }

    if (!isTitleValid) {
      setErrorMessage(
        titleBytes === 0
          ? 'Grievance title is required.'
          : `Grievance title exceeds maximum limit of 200 bytes (currently ${titleBytes} bytes).`
      );
      return;
    }

    if (!description.trim()) {
      setErrorMessage('Grievance description text is required.');
      return;
    }

    if (!departmentId) {
      setErrorMessage('Please select a responsible department.');
      return;
    }

    if (!categoryId) {
      setErrorMessage('Please select a grievance category.');
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

      // 4. State: AWAITING_WALLET — MetaMask popup appears
      setTxState('AWAITING_WALLET');
      setTxMessage('Waiting for wallet confirmation... Please approve the transaction in MetaMask.');

      // Phase 1: This resolves ONLY after the user signs in MetaMask
      // and the transaction is broadcast to the network.
      const { tx, grievanceContract } = await sendGrievanceTransaction(signer, {
        categoryId: Number(categoryId),
        departmentId: Number(departmentId),
        priority: Number(priority),
        title: title.trim(),
        descriptionCid: ipfsResult.cid,
        descriptionHash: ipfsResult.contentHash,
      });

      // 5. State: MINING — User has signed, tx is in the mempool
      setPendingTxHash(tx.hash);
      setTxState('MINING');
      setTxMessage('Transaction signed and broadcast. Waiting for block confirmation...');

      // Phase 2: Wait for the transaction to be mined
      const result = await waitForGrievanceConfirmation(tx, grievanceContract);

      // 6. State: VERIFYING_AUDIT — Receipt received, verifying AuditTrail
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="primary">Official Public Intake</Badge>
            <span className="text-xs text-slate-500 font-mono">Step 11C Flow</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
            Submit Public Grievance
          </h1>
          <p className="text-xs text-slate-500">
            Submit official grievances recorded immutably on Ethereum with IPFS CID dual-reference proofs.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate('/citizen')}>
          ← Back to Citizen Portal
        </Button>
      </div>

      {/* Contract Not Deployed Banner */}
      {!isContractConfigured('GrievanceSystem') && (
        <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-900 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-sm font-bold text-amber-900">Contract deployment configuration incomplete.</div>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                The <code className="font-mono font-semibold">GrievanceSystem</code> contract address is not configured.
                Deploy contracts via Remix to your target network and configure <code className="font-mono font-semibold">VITE_GRIEVANCE_SYSTEM_ADDRESS</code> in <code className="font-mono">frontend/.env</code>.
              </p>
            </div>
          </div>
          <div className="text-[11px] text-amber-700 pl-9">
            Please refer to <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded">REMIX_DEPLOYMENT.md</code> for the exact Remix compilation, deployment, and configuration workflow.
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <Alert variant="danger" title="Submission Error" onClose={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}

      {/* Transaction Progress Banner */}
      {txState !== 'IDLE' && txState !== 'ERROR' && (
        <div className={`p-4 rounded-xl border space-y-2 ${
          txState === 'VERIFYING_AUDIT'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : txState === 'AWAITING_WALLET'
              ? 'bg-orange-50 border-orange-200 text-orange-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
          <div className="flex items-center gap-3">
            {txState === 'AWAITING_WALLET' ? (
              <span className="text-xl shrink-0">🦊</span>
            ) : txState === 'VERIFYING_AUDIT' ? (
              <span className="text-xl shrink-0">✅</span>
            ) : (
              <svg className="animate-spin h-5 w-5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            )}
            <span className="text-sm font-semibold">{txMessage}</span>
          </div>
          <div className="text-xs pl-8 space-y-1">
            <div>
              State:{' '}
              <span className="font-mono uppercase font-bold">{txState}</span> — Please keep your browser open.
            </div>
            {pendingTxHash && (txState === 'MINING' || txState === 'VERIFYING_AUDIT') && (
              <div className="font-mono text-[11px] break-all">
                Tx Hash: {pendingTxHash}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registration Check Notification */}
      {isConnected && !isRegistered && (
        <Card className="border-amber-300 bg-amber-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="primary">Direct Intake Enabled</Badge>
                <span className="text-xs font-semibold text-slate-900">On-Chain Identity</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Permissionless intake is enabled: you can submit grievances directly with any wallet. You may also optionally record your profile in
                <code className="font-mono text-slate-950 font-semibold ml-1">RoleManager.sol</code>.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={isSelfRegistering}
              onClick={handleRegister}
              className="border-blue-300 text-blue-800 hover:bg-blue-50 shrink-0"
            >
              Optional: Register Profile
            </Button>
          </div>
        </Card>
      )}

      {/* Main Grievance Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section A: Grievance Information */}
        <Card title="Section A: Grievance Information" subtitle="Public summary title and full incident details">
          <div className="space-y-4">
            {/* Title */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="title" className="text-xs font-semibold text-slate-700">
                  Grievance Title <span className="text-rose-500">*</span>
                </label>
                <span
                  className={`text-[11px] font-mono ${
                    titleBytes > 200 ? 'text-rose-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  {titleBytes} / 200 bytes (max)
                </span>
              </div>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Overflowing dumpster and waste accumulation on Main Street"
                disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${
                  titleBytes > 200
                    ? 'border-rose-400 focus:ring-rose-300'
                    : 'border-slate-300 focus:ring-blue-500'
                }`}
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Stored on-chain in GrievanceSystem.sol for gas-efficient summary listing and event logs.
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-xs font-semibold text-slate-700 mb-1">
                Detailed Grievance Description <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="description"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in full detail, including location, observations, timeline, and requested government remedy..."
                disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <p className="text-[11px] text-slate-500 mt-1">
                The description is encoded into a canonical JSON payload, stored on IPFS, and permanently committed to the smart contract via its Keccak-256 hash.
              </p>
            </div>
          </div>
        </Card>

        {/* Section B: Classification */}
        <Card title="Section B: Classification" subtitle="Select responsible jurisdiction and priority tier">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Department */}
            <div>
              <label htmlFor="department" className="block text-xs font-semibold text-slate-700 mb-1">
                Responsible Department <span className="text-rose-500">*</span>
              </label>
              {isLoadingEntities ? (
                <div className="text-xs text-slate-400 py-2">Loading active departments from contract...</div>
              ) : departments.length > 0 ? (
                <select
                  id="department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      Dept #{dept.id}: {dept.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 text-xs bg-amber-50 text-amber-800 rounded border border-amber-200">
                  No active departments are currently available on DepartmentManager.
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-xs font-semibold text-slate-700 mb-1">
                Grievance Category <span className="text-rose-500">*</span>
              </label>
              {isLoadingEntities ? (
                <div className="text-xs text-slate-400 py-2">Loading active categories from contract...</div>
              ) : categories.length > 0 ? (
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      Cat #{cat.id}: {cat.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 text-xs bg-amber-50 text-amber-800 rounded border border-amber-200">
                  No active categories are currently available on DepartmentManager.
                </div>
              )}
            </div>

            {/* Priority Tier */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Urgency Priority Tier <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {Object.values(PRIORITIES).map((pVal) => {
                  const meta = PRIORITY_METADATA[pVal];
                  const isSelected = priority === pVal;
                  return (
                    <div
                      key={pVal}
                      onClick={() => {
                        if (txState === 'IDLE' || txState === 'ERROR') {
                          setPriority(pVal);
                        }
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{meta.label}</span>
                        <Badge variant={meta.badgeVariant} className="text-[10px]">
                          {meta.slaDays}d SLA
                        </Badge>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                        {meta.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {/* Section C: Supporting Evidence */}
        <Card title="Section C: Supporting Evidence (Optional)" subtitle="Attach documents, photos, or media files">
          <div className="space-y-3">
            <div>
              <label htmlFor="evidence-file" className="block text-xs font-semibold text-slate-700 mb-1">
                Evidence File (PDF, PNG, JPG, JPEG — Max 10MB)
              </label>
              <input
                id="evidence-file"
                type="file"
                onChange={handleFileChange}
                disabled={txState !== 'IDLE' && txState !== 'ERROR'}
                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>

            {isHashingEvidence && (
              <div className="text-xs text-blue-600 flex items-center gap-2">
                <span className="animate-spin">⏳</span> Calculating IPFS CIDv1 and Keccak-256 content hash...
              </div>
            )}

            {evidenceInfo && (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between font-semibold text-slate-800">
                  <span>File: {evidenceInfo.fileName}</span>
                  <span>{(evidenceInfo.fileSize / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between text-slate-500 font-mono text-[11px] break-all">
                  <span>IPFS CID: {evidenceInfo.cid}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between text-slate-500 font-mono text-[11px] break-all">
                  <span>Content Hash: {evidenceInfo.contentHash}</span>
                </div>
                <p className="text-[11px] text-amber-700 pt-1 border-t border-slate-200">
                  ℹ️ Note: Evidence is hashed and prepared on IPFS. As per the Solidity contract architecture, evidence is formally attached to the newly created grievance ID in a subsequent on-chain transaction.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Section D: Blockchain Review & Submission */}
        <Card title="Section D: Blockchain Review & Submission" subtitle="Verify parameters before signing">
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Citizen Submitter:</span>
                <span className="font-mono text-slate-800 font-semibold">{address || 'Wallet Disconnected'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Network:</span>
                <span className="font-mono text-slate-800">{networkName || `Chain ID ${chainId}`}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Grievance Target:</span>
                <span className="font-mono text-slate-800">GrievanceSystem.createGrievance()</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Audit Commitment:</span>
                <span className="font-mono text-slate-800">AuditTrail.sol (GRIEVANCE_CREATED)</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <span className="text-xs text-slate-500">
                Submitting requires MetaMask signature. Gas fees apply on the selected network.
              </span>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={txState !== 'IDLE' && txState !== 'ERROR'}
                disabled={!isConnected || !isTitleValid || !description.trim() || departments.length === 0 || !isContractConfigured('GrievanceSystem')}
                className="w-full sm:w-auto font-semibold px-8"
              >
                Submit Grievance to Blockchain
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
}
