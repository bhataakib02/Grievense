import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import deploymentManifest from '../../config/deploymentManifest.json';
import { CONTRACT_ADDRESSES, CONTRACT_METADATA, SEPOLIA_RPC_URL, TARGET_CHAIN_ID } from '../../config/contracts';
import { isValidAddress } from '../../utils/formatters';

/**
 * Production-grade Deployment Guard Banner
 *
 * 1. Verifies that current frontend contract addresses align with authoritative deployment manifest.
 * 2. Directly verifies bytecode on Ethereum Sepolia for all configured contracts.
 * 3. Shows a blocking error banner if any configured contract has ZERO bytecode.
 */
export function DeploymentGuardBanner() {
  const [mismatches, setMismatches] = useState([]);
  const [zeroBytecodeContracts, setZeroBytecodeContracts] = useState([]);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // 1. Check address mismatches against canonical manifest
    const detected = [];
    const manifestContracts = deploymentManifest.contracts || {};

    const mapping = [
      { key: 'roleManager', current: CONTRACT_ADDRESSES.RoleManager, label: 'RoleManager' },
      { key: 'departmentManager', current: CONTRACT_ADDRESSES.DepartmentManager, label: 'DepartmentManager' },
      { key: 'grievanceSystem', current: CONTRACT_ADDRESSES.GrievanceSystem, label: 'GrievanceSystem' },
      { key: 'escalationManager', current: CONTRACT_ADDRESSES.EscalationManager, label: 'EscalationManager' },
      { key: 'auditTrail', current: CONTRACT_ADDRESSES.AuditTrail, label: 'AuditTrail' },
    ];

    for (const item of mapping) {
      const manifestAddr = (manifestContracts[item.key] || '').toLowerCase();
      const currentAddr = (item.current || '').toLowerCase();

      if (manifestAddr && currentAddr && manifestAddr !== currentAddr) {
        detected.push({
          contract: item.label,
          manifest: manifestContracts[item.key],
          current: item.current,
        });
      }
    }

    setMismatches(detected);

    // 2. Perform zero-bytecode check against configured Sepolia RPC
    let active = true;
    async function verifyBytecodeOnSepolia() {
      try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL, TARGET_CHAIN_ID, { staticNetwork: true });
        const missingCode = [];

        await Promise.all(
          CONTRACT_METADATA.map(async (meta) => {
            const addr = CONTRACT_ADDRESSES[meta.key];
            if (addr && isValidAddress(addr)) {
              try {
                const code = await provider.getCode(addr);
                if (!code || code === '0x' || code === '0x0') {
                  missingCode.push({ name: meta.label, key: meta.key, address: addr });
                }
              } catch (e) {
                // If RPC fails or rate-limits, do not false-positive as 0x bytecode
                console.warn(`[DeploymentGuard] Could not query bytecode for ${meta.label}:`, e);
              }
            }
          })
        );

        if (active && missingCode.length > 0) {
          setZeroBytecodeContracts(missingCode);
        }
      } catch (err) {
        console.warn('[DeploymentGuard] RPC connection check skipped:', err);
      }
    }

    verifyBytecodeOnSepolia();

    return () => {
      active = false;
    };
  }, []);

  // Zero-bytecode blocking error banner takes absolute priority
  if (zeroBytecodeContracts.length > 0) {
    return (
      <div className="bg-red-950 border-b-2 border-red-600 text-red-100 px-4 py-3 shadow-xl z-50 animate-pulse">
        <div className="max-w-7xl mx-auto flex items-start gap-3">
          <div className="p-2 bg-red-600/30 text-red-300 rounded-lg text-xl flex-shrink-0">
            🚨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wider uppercase text-red-300">
                BLOCKING CONFIGURATION ERROR: ZERO BYTECODE DETECTED
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-red-900 text-red-200 border border-red-700">
                Ethereum Sepolia ({TARGET_CHAIN_ID})
              </span>
            </div>
            <p className="text-xs text-red-200 mt-1 max-w-4xl leading-relaxed">
              The following configured smart contract(s) have <strong>zero bytecode (0x)</strong> on Ethereum Sepolia.
              The contract address is either incorrect or has not been deployed. Data reads and transactions cannot succeed:
            </p>
            <ul className="mt-2 space-y-1 text-xs font-mono">
              {zeroBytecodeContracts.map((c) => (
                <li key={c.key} className="text-red-300">
                  • <strong>{c.name}</strong>: {c.address}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (mismatches.length === 0 || isDismissed) {
    return null;
  }

  return (
    <div className="bg-amber-900/90 border-b-2 border-amber-500 text-amber-100 px-4 py-3 shadow-lg z-50">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/20 text-amber-300 rounded-lg text-xl flex-shrink-0">
            ⚠️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wider uppercase text-amber-300">
                NEW BLOCKCHAIN DEPLOYMENT DETECTED
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-800 text-amber-200 border border-amber-600">
                Manifest v{deploymentManifest.deploymentVersion}
              </span>
            </div>
            <p className="text-xs text-amber-200 mt-1 max-w-4xl leading-relaxed">
              Active contract addresses differ from the deployment manifest baseline.
              A newly deployed Solidity contract has fresh storage and does NOT automatically contain records from the previous contract.
              Previous data remains permanently preserved on Ethereum Sepolia at the prior contract addresses.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="px-3 py-1.5 text-xs bg-amber-800/80 hover:bg-amber-700 text-amber-100 rounded border border-amber-600 transition"
          >
            {showDetails ? 'Hide Details' : 'Inspect Address Changes'}
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-100"
            title="Dismiss notice"
          >
            ✕
          </button>
        </div>
      </div>

      {showDetails && (
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-amber-700/60 text-xs">
          <p className="font-semibold text-amber-200 mb-2">Changed Contract Addresses:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {mismatches.map((item) => (
              <div key={item.contract} className="bg-amber-950/60 p-2 rounded border border-amber-800 font-mono text-[11px]">
                <div className="font-bold text-amber-300">{item.contract}</div>
                <div className="text-amber-400 truncate" title={`Active: ${item.current}`}>
                  Active: {item.current}
                </div>
                <div className="text-slate-400 truncate" title={`Manifest: ${item.manifest}`}>
                  Base: {item.manifest}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DeploymentGuardBanner;
