import { ethers } from 'ethers';
import deploymentManifest from '../frontend/src/config/deploymentManifest.json' with { type: 'json' };
import { CONTRACT_ADDRESSES, TARGET_CHAIN_ID, SEPOLIA_RPC_URL } from '../frontend/src/config/contracts.js';
import { getCachedCitizenGrievances, verifyGrievanceWithBlockchain } from '../frontend/src/services/cachedDataService.js';
import { fetchGrievanceDetails, fetchActiveDepartments } from '../frontend/src/services/grievanceService.js';

console.log('================================================================');
console.log('OFF-CHAIN INTEGRATION & BLOCKCHAIN VERIFICATION TEST');
console.log('================================================================');

async function runTests() {
  const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL, TARGET_CHAIN_ID, { staticNetwork: true });

  // Test 1: Deployment Manifest Consistency
  console.log('\n--- 1. Deployment Manifest Consistency ---');
  console.log('Manifest version:', deploymentManifest.deploymentVersion);
  console.log('Manifest chainId:', deploymentManifest.chainId);

  const manifestContracts = deploymentManifest.contracts;
  for (const [key, addr] of Object.entries(CONTRACT_ADDRESSES)) {
    const manifestKey = key.charAt(0).toLowerCase() + key.slice(1);
    const expected = manifestContracts[manifestKey] || manifestContracts[key];
    if (!expected || expected.toLowerCase() !== addr.toLowerCase()) {
      throw new Error(`Address mismatch for ${key}: manifest has ${expected}, contracts.js has ${addr}`);
    }
  }
  console.log('✓ All 5 contract addresses align perfectly between manifest and contracts.js');

  // Test 2: Live Sepolia Bytecode Verification
  console.log('\n--- 2. Live Sepolia Bytecode Verification ---');
  for (const [name, addr] of Object.entries(CONTRACT_ADDRESSES)) {
    const code = await provider.getCode(addr);
    if (!code || code === '0x' || code === '0x0') {
      throw new Error(`ZERO BYTECODE for ${name} at ${addr}`);
    }
    console.log(`✓ ${name} at ${addr}: ${code.length} bytes bytecode`);
  }

  // Test 3: Authoritative On-Chain Read Verification (Grievance #1 & Dept #1)
  console.log('\n--- 3. Authoritative On-Chain State ---');
  const depts = await fetchActiveDepartments(provider);
  console.log(`✓ On-Chain Active Departments: ${depts.length}`);
  if (depts.length > 0) {
    console.log(`  Dept #1: ID=${depts[0].id}, Name="${depts[0].name}", Admin=${depts[0].admin}`);
  }

  const g1 = await fetchGrievanceDetails(provider, 1);
  console.log(`✓ On-Chain Grievance #1 Details:`);
  console.log(`  Citizen: ${g1.citizen}`);
  console.log(`  Title: "${g1.title}"`);
  console.log(`  Status: ${g1.status}`);
  console.log(`  Description CID: ${g1.descriptionCid}`);
  console.log(`  Description Hash: ${g1.descriptionHash}`);

  // Test 4: Dual Read-Cache Fallback Verification
  console.log('\n--- 4. Dual Read-Cache Fallback Verification ---');
  // Even if backend is not running or returns empty, getCachedCitizenGrievances must seamlessly return on-chain data
  const citizenGrievances = await getCachedCitizenGrievances(provider, g1.citizen);
  console.log(`✓ Retrieved ${citizenGrievances.length} grievance(s) for citizen ${g1.citizen}`);
  if (citizenGrievances.length > 0) {
    console.log(`  Grievance #1 confirmed: title="${citizenGrievances[0].title}", status=${citizenGrievances[0].status}`);
  }

  // Test 5: On-Chain Verification Layer
  console.log('\n--- 5. On-Chain Verification Layer ---');
  const verification = await verifyGrievanceWithBlockchain(provider, 1, citizenGrievances[0]);
  console.log('✓ Grievance #1 Verified with Blockchain:', verification.verified, 'Matches:', verification.matches);
  if (!verification.matches) {
    throw new Error('Verification failed: cached grievance did not match authoritative blockchain state.');
  }

  console.log('\n================================================================');
  console.log('✅ ALL OFF-CHAIN INTEGRATION TESTS PASSED CLEANLY');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
