import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWallet } from '../hooks/useWallet';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Alert } from '../components/common/Alert';
import {
  CONTRACT_ADDRESSES,
  CONTRACT_NAMES,
  SEPOLIA_RPC_URL,
  SEPOLIA_EXPLORER_URL,
  TARGET_CHAIN_ID,
  verifyContractBytecode,
} from '../contracts/addresses.js';
import { formatChainName, shortenAddress, getExplorerAddressUrl } from '../utils/formatters.js';
import { getGrievanceSystemContract } from '../services/blockchain.js';

export function BlockchainDebugPage() {
  const { address, chainId, provider, diagnostics, isConnected } = useWallet();

  const [bytecodeStatus, setBytecodeStatus] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [liveData, setLiveData] = useState({
    blockNumber: null,
    gasPrice: null,
    grievanceCount: null,
    accountBalance: null,
    lastQueried: null,
  });
  const [queryError, setQueryError] = useState(null);

  // Obtain an active provider (MetaMask if connected, or direct public JsonRpcProvider)
  const getActiveProvider = useCallback(() => {
    if (provider) return provider;
    try {
      return new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    } catch {
      return null;
    }
  }, [provider]);

  // Check bytecode on all contracts
  const runBytecodeVerification = useCallback(async () => {
    setIsVerifying(true);
    setQueryError(null);
    try {
      const activeP = getActiveProvider();
      if (!activeP) {
        throw new Error('No RPC provider available to verify bytecode.');
      }
      const verification = await verifyContractBytecode(activeP);
      setBytecodeStatus(verification);

      // Query live block number & fee data
      let block = null;
      let feeData = null;
      try {
        block = await activeP.getBlockNumber();
        feeData = await activeP.getFeeData();
      } catch (rpcErr) {
        console.warn('Could not query block height or fee data:', rpcErr);
      }

      let balance = null;
      if (address) {
        try {
          const balWei = await activeP.getBalance(address);
          balance = ethers.formatEther(balWei);
        } catch (balErr) {
          console.warn('Could not query account balance:', balErr);
        }
      }

      // Query grievance count from GrievanceSystem if configured
      let count = null;
      if (CONTRACT_ADDRESSES.GrievanceSystem) {
        try {
          const gContract = getGrievanceSystemContract(activeP);
          const countBn = await gContract.getGrievanceCount();
          count = Number(countBn);
        } catch (err) {
          console.warn('Could not query grievance count from GrievanceSystem:', err);
        }
      }

      setLiveData({
        blockNumber: block,
        gasPrice: feeData?.gasPrice ? `${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei` : 'N/A',
        grievanceCount: count,
        accountBalance: balance,
        lastQueried: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('Bytecode verification failed:', err);
      setQueryError(err?.message || 'Verification failed.');
    } finally {
      setIsVerifying(false);
    }
  }, [getActiveProvider, address]);

  useEffect(() => {
    runBytecodeVerification();
  }, [runBytecodeVerification]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-4">
      {/* Top Banner */}
      <Card className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-0 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="neutral" className="bg-indigo-900/80 text-indigo-200 border-indigo-700">
                Ethereum Sepolia
              </Badge>
              <span className="text-xs text-slate-300 font-mono">Chain ID: {TARGET_CHAIN_ID}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              Blockchain Diagnostics & Smart Contract Status
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Inspect on-chain contract bytecode, RPC node connectivity, and live Sepolia blockchain state.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            loading={isVerifying}
            onClick={runBytecodeVerification}
            className="bg-indigo-600 hover:bg-indigo-700 shrink-0"
          >
            Re-Check RPC & Bytecode
          </Button>
        </div>
      </Card>

      {queryError && (
        <Alert variant="danger" title="RPC Diagnostic Error">
          {queryError}
        </Alert>
      )}

      {/* Network & Node Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Sepolia RPC Node</div>
          <div className="text-sm font-mono font-bold text-slate-900 mt-1 truncate" title={SEPOLIA_RPC_URL}>
            {SEPOLIA_RPC_URL}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1">● Public Testnet RPC</div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Target Chain ID</div>
          <div className="text-sm font-mono font-bold text-slate-900 mt-1">
            {TARGET_CHAIN_ID} ({formatChainName(TARGET_CHAIN_ID)})
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Wallet Chain: {chainId ? formatChainName(chainId) : 'Not Connected'}
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Sepolia Block Height</div>
          <div className="text-sm font-mono font-bold text-indigo-700 mt-1">
            #{liveData.blockNumber !== null ? liveData.blockNumber : '...'}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Gas Price: {liveData.gasPrice || 'N/A'}
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">On-Chain Grievances</div>
          <div className="text-sm font-mono font-bold text-emerald-700 mt-1">
            {liveData.grievanceCount !== null ? `${liveData.grievanceCount} total` : (CONTRACT_ADDRESSES.GrievanceSystem ? '0' : 'Not Deployed')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Queried at: {liveData.lastQueried || 'Pending'}
          </div>
        </Card>
      </div>

      {/* Contract Bytecode Verification Matrix */}
      <Card
        title="Smart Contract Bytecode Verification Matrix"
        subtitle="Confirms that smart contracts are deployed and have non-empty bytecode on Ethereum Sepolia"
      >
        <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white">
          <table className="w-full min-w-[640px] divide-y divide-slate-200 text-xs font-sans">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Contract Name</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Deployed Address</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Configuration</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Bytecode On-Chain</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Explorer Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white font-mono">
              {CONTRACT_NAMES.map((item) => {
                const res = bytecodeStatus?.results?.[item.key];
                const address = CONTRACT_ADDRESSES[item.key];
                const isConfig = Boolean(address);
                const hasCode = res?.hasBytecode ?? false;

                return (
                  <tr key={item.key} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-sans">
                      <div className="font-bold text-slate-900">{item.label}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{item.key}.sol</div>
                    </td>
                    <td className="px-4 py-3 text-slate-800 break-all text-[11px]">
                      {address ? (
                        <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200 text-slate-900">
                          {address}
                        </span>
                      ) : (
                        <span className="text-amber-700 italic bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Awaiting Sepolia Deployment
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-sans">
                      {isConfig ? (
                        <Badge variant="success" className="text-[10px]">Configured</Badge>
                      ) : (
                        <Badge variant="warning" className="text-[10px]">Missing in .env</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-sans">
                      {hasCode ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-xs">
                          <span>✓</span> Verified Bytecode
                        </span>
                      ) : isConfig ? (
                        <span className="inline-flex items-center gap-1 text-rose-600 font-semibold text-xs">
                          <span>✗</span> No Code (0x)
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">
                          Pending Config
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      {address ? (
                        <a
                          href={getExplorerAddressUrl(address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 underline font-semibold text-xs inline-flex items-center gap-1"
                        >
                          View on Etherscan ↗
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Connected Wallet & Provider Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          title="Active Wallet Session"
          subtitle="MetaMask connection and account information"
        >
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Status:</span>
              <span className="font-semibold text-slate-900">
                {isConnected ? '🟢 Connected' : '⚪ Disconnected'}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Wallet Address:</span>
              <span className="font-mono text-slate-900">
                {address ? (
                  <a
                    href={getExplorerAddressUrl(address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {shortenAddress(address, 6)} ↗
                  </a>
                ) : (
                  'None'
                )}
              </span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Sepolia Balance:</span>
              <span className="font-mono font-semibold text-slate-900">
                {liveData.accountBalance !== null ? `${Number(liveData.accountBalance).toFixed(4)} SepoliaETH` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Provider Type:</span>
              <span className="font-semibold text-slate-900">
                {diagnostics?.selectedProvider?.isGenuineMetaMask
                  ? 'MetaMask (Genuine)'
                  : (diagnostics?.selectedProvider?.isPhantom ? 'Phantom' : 'Injected Web3')}
              </span>
            </div>
          </div>
        </Card>

        <Card
          title="Sepolia Deployment Guide"
          subtitle="How to deploy verified contracts to Ethereum Sepolia"
        >
          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <ol className="list-decimal list-inside space-y-1.5 text-slate-700">
              <li>Open <strong className="text-slate-900">Remix IDE</strong> (remix.ethereum.org).</li>
              <li>Under <strong className="text-slate-900">Deploy & Run Transactions</strong>, select <code className="bg-slate-100 px-1 py-0.5 rounded text-blue-800">Injected Provider - MetaMask</code>.</li>
              <li>Make sure MetaMask is switched to <strong className="text-slate-900">Sepolia Testnet</strong>.</li>
              <li>Deploy contracts in order: <code className="bg-slate-100 px-1 py-0.5 rounded">RoleManager</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">DepartmentManager</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">GrievanceSystem</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">EscalationManager</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">AuditTrail</code>.</li>
              <li>Paste the deployed contract addresses into <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">frontend/.env</code>.</li>
            </ol>
            <div className="pt-2">
              <a
                href={`${SEPOLIA_EXPLORER_URL}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-semibold underline inline-flex items-center gap-1"
              >
                Open Sepolia Etherscan ↗
              </a>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
export default BlockchainDebugPage;
