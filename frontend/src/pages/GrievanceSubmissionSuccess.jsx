import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { useRouter } from '../hooks/useRouter';
import { shortenAddress, getExplorerTxUrl } from '../utils/formatters';

export function GrievanceSubmissionSuccess({
  grievanceId,
  txHash,
  blockNumber,
  citizenAddress,
  contractAddress,
  networkName,
  chainId,
  descriptionCid,
  descriptionHash,
  auditVerification,
  ipfsPersisted,
  gatewayUrl,
  ipfsProvider,
}) {
  const { navigate } = useRouter();
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2500);
  };

  const explorerUrl = getExplorerTxUrl(chainId, txHash);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <Card className="bg-linear-to-r from-emerald-900 to-slate-900 text-white border-0 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg">
                ✓
              </span>
              <span className="text-xs font-semibold tracking-wider uppercase text-emerald-300">
                Blockchain Confirmation
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Grievance Submitted Successfully
            </h2>
            <p className="text-xs text-slate-300">
              Your public grievance intake record is permanently minted on-chain.
            </p>
          </div>
          <div>
            <Badge variant="success" className="bg-emerald-800 text-emerald-200 border-emerald-600 text-sm px-3 py-1">
              Grievance #{grievanceId}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Main Submission Summary */}
      <Card title="On-Chain Record Details" subtitle="Cryptographic receipt & lifecycle status">
        <div className="divide-y divide-slate-100 text-sm">
          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Grievance ID:</span>
            <span className="font-mono font-bold text-slate-900 text-base">#{grievanceId}</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Lifecycle Status:</span>
            <Badge variant="primary" className="w-fit">
              SUBMITTED
            </Badge>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Submitted By:</span>
            <div className="flex items-center gap-2 font-mono text-slate-800 text-xs sm:text-sm">
              <span>{citizenAddress}</span>
              <button
                type="button"
                onClick={() => handleCopy(citizenAddress, 'citizen')}
                className="text-blue-600 hover:text-blue-800 text-xs underline cursor-pointer"
              >
                {copiedField === 'citizen' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Transaction Hash:</span>
            <div className="flex items-center gap-2 font-mono text-slate-800 text-xs sm:text-sm break-all">
              <span>{txHash}</span>
              <button
                type="button"
                onClick={() => handleCopy(txHash, 'tx')}
                className="text-blue-600 hover:text-blue-800 text-xs underline cursor-pointer shrink-0"
              >
                {copiedField === 'tx' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {blockNumber && (
            <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
              <span className="text-slate-500 font-medium">Block Number:</span>
              <span className="font-mono text-slate-800 font-medium">Block #{blockNumber}</span>
            </div>
          )}

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Network:</span>
            <span className="font-mono text-slate-800">{networkName || `Chain ID ${chainId}`}</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Contract Address:</span>
            <span className="font-mono text-slate-800 text-xs">{contractAddress ? shortenAddress(contractAddress, 8) : 'GrievanceSystem'}</span>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
            <span className="text-slate-500 font-medium">Off-Chain Storage:</span>
            <div className="flex flex-col sm:items-end gap-1.5">
              <div className="flex items-center gap-2">
                {ipfsPersisted ? (
                  <Badge variant="success" className="text-xs">
                    ✓ Published to IPFS ({ipfsProvider})
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs">
                    ⚠️ Local Preview CID (Unpublished to IPFS)
                  </Badge>
                )}
                <span className="font-mono text-xs text-slate-600">
                  {descriptionCid ? shortenAddress(descriptionCid, 6) : ''}
                </span>
                {descriptionCid && (
                  <button
                    type="button"
                    onClick={() => handleCopy(descriptionCid, 'cid')}
                    className="text-blue-600 hover:text-blue-800 text-xs underline cursor-pointer"
                  >
                    {copiedField === 'cid' ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              {gatewayUrl && (
                <a
                  href={gatewayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-mono"
                >
                  View on IPFS Gateway ↗
                </a>
              )}
            </div>
          </div>

          <div className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
            <span className="text-slate-500 font-medium">Audit Record Verification:</span>
            {auditVerification?.isVerified ? (
              <Badge variant="success" className="bg-emerald-50 text-emerald-800 border-emerald-300">
                ✓ Recorded on AuditTrail.sol (Audit ID #{auditVerification.auditId})
              </Badge>
            ) : (
              <Badge variant="warning" className="bg-amber-50 text-amber-800 border-amber-300">
                Recorded via GrievanceCreated event
              </Badge>
            )}
          </div>
        </div>

        {descriptionHash && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-xs text-slate-500 font-medium mb-1">On-Chain Content Commitment (Keccak-256 Hash):</div>
            <div className="font-mono text-xs text-slate-800 break-all">{descriptionHash}</div>
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
        <Button
          variant="secondary"
          onClick={() => navigate('/citizen')}
        >
          Return to Dashboard
        </Button>

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center font-medium rounded-lg text-sm px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer"
          >
            View in Block Explorer ↗
          </a>
        )}

        <Button
          variant="primary"
          onClick={() => navigate(`/citizen/grievance/${grievanceId}`)}
        >
          View Grievance #{grievanceId}
        </Button>
      </div>
    </div>
  );
}
