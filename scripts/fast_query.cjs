const { ethers } = require('ethers');

const RPC = 'https://gateway.tenderly.co/public/sepolia';

async function rpcCall(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(8000)
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(json.error.message || JSON.stringify(json.error));
  }
  return json.result;
}

async function getCode(addr) {
  return await rpcCall('eth_getCode', [addr.toLowerCase(), 'latest']);
}

async function ethCall(to, data, from = '0x9a93E885ee877f133c00ee262c4bbacf3d804149') {
  return await rpcCall('eth_call', [{ from, to: to.toLowerCase(), data }, 'latest']);
}

const ADDRESSES = {
  RoleManager: '0x2e9F0205712d901E8034695c0825DDF8b4870e64',
  DepartmentManager: '0x653e0F0D8C7dD9C26eA02EB5cac513A9556707Bd',
  GrievanceSystem_Prompt: '0xc6C374763bf25875E503B809e559bB374A28fF04',
  GrievanceSystem_Env: '0x0c6374763bf25875E503B809e559bB37A428Ff04',
  EscalationManager: '0xCdC42E0c21b25D6a9accE526D05075316dcBa563',
  AuditTrail: '0x7ae2779953D1947D5B974dD07b1fAE241A5e744A',
};

async function main() {
  console.log('--- CHECKING BYTECODES ---');
  for (const [name, addr] of Object.entries(ADDRESSES)) {
    try {
      const code = await getCode(addr);
      console.log(`${name}: len=${code ? code.length : 0} (${addr})`);
    } catch (e) {
      console.log(`${name}: ERROR ${e.message}`);
    }
  }
}

main().catch(console.error);
