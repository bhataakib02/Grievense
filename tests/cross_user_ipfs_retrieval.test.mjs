import http from 'http';
import { ethers } from 'file:///d:/Grievense/frontend/node_modules/ethers/lib.esm/index.js';
import {
  createCanonicalDescriptionPayload,
  computeContentHash,
  computeIpfsCidV1,
  uploadText,
  fetchFromIpfs,
} from 'file:///d:/Grievense/frontend/src/services/ipfs.js';

/**
 * IPFS Adapter & Protocol Compatibility Integration Test
 *
 * TEST DAEMON AUDIT & CLASSIFICATION:
 * - Daemon Implementation: In-Process Node.js HTTP Server (`http.createServer`)
 * - Emulated Endpoints: IPFS Kubo RPC (`/api/v0/add?pin=true`) & Gateway (`/ipfs/:cid`)
 * - Classification: Type C (Custom/Mock HTTP test daemon)
 *
 * OBJECTIVE & SCOPE:
 * - Verifies the frontend application's `ipfs.js` adapter logic:
 *   1. Canonical JSON serialization (`schemaVersion: '1.0'`)
 *   2. RFC 4648 Base32 CIDv1 computation (`bafkrei...`)
 *   3. Keccak-256 content hash commitment generation (`ethers.keccak256`)
 *   4. Multipart HTTP form data upload via standard `/api/v0/add` endpoint
 *   5. Accurate return of `{ cid, contentHash, gatewayUrl, persisted: true }`
 *   6. Cross-context retrieval via HTTP gateway WITHOUT relying on browser localStorage (`allowCacheFallback: false`)
 *   7. Recomputation and verification of Keccak-256 on-chain hash commitment
 *   8. Tamper detection (ensuring altered content causes hash mismatch)
 *
 * CRITICAL ARCHITECTURAL LIMITATION:
 * - This test does NOT prove genuine decentralized IPFS network behavior or DHT propagation.
 * - Genuine decentralized IPFS verification requires an actual running Kubo/IPFS node.
 *
 * =========================================================================
 * FUTURE REAL-NODE VERIFICATION SETUP (Kubo / IPFS Node)
 * =========================================================================
 * 1. Download & Install Kubo (formerly go-ipfs):
 *    Website: https://docs.ipfs.tech/install/command-line/
 *    Windows (Chocolatey): choco install ipfs
 *    Windows (Scoop): scoop install ipfs
 * 2. Initialize IPFS repository:
 *    ipfs init
 * 3. Configure CORS headers to allow frontend and test requests:
 *    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
 *    ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
 * 4. Start genuine Kubo daemon:
 *    ipfs daemon
 * 5. Run this test against the real daemon:
 *    $env:IPFS_API_URL="http://127.0.0.1:5001"
 *    $env:IPFS_GATEWAY_URL="http://127.0.0.1:8080"
 *    node tests/cross_user_ipfs_retrieval.test.mjs
 * =========================================================================
 */
async function runCrossUserIpfsTest() {
  console.log('================================================================');
  console.log('IPFS ADAPTER & PROTOCOL COMPATIBILITY INTEGRATION TEST');
  console.log('================================================================');

  let server = null;
  let daemonUrl = process.env.IPFS_API_URL;
  let isRealKubo = Boolean(daemonUrl);

  if (!daemonUrl) {
    console.log('\n[AUDIT NOTICE] No external IPFS daemon configured via IPFS_API_URL.');
    console.log('[CLASSIFICATION: C] Starting in-process mock HTTP daemon implementing');
    console.log('                   /api/v0/add and /ipfs/:cid for adapter verification.\n');

    // In-memory block store for the mock HTTP daemon
    const ipfsStorage = new Map();

    server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // IPFS RPC: /api/v0/add
      if (req.method === 'POST' && req.url.startsWith('/api/v0/add')) {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
          const bodyBuffer = Buffer.concat(chunks);
          const bodyString = bodyBuffer.toString('utf8');

          let jsonContent = bodyString;
          const boundaryMatch = req.headers['content-type']?.match(/boundary=(.+)/);
          if (boundaryMatch) {
            const parts = bodyString.split(boundaryMatch[1]);
            for (const part of parts) {
              if (part.includes('{') && part.includes('}')) {
                const start = part.indexOf('{');
                const end = part.lastIndexOf('}');
                jsonContent = part.substring(start, end + 1);
                break;
              }
            }
          }

          const dataBytes = ethers.toUtf8Bytes(jsonContent);
          const cid = computeIpfsCidV1(dataBytes);

          ipfsStorage.set(cid, jsonContent);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ Hash: cid, Size: dataBytes.length }));
        });
        return;
      }

      // IPFS Gateway: /ipfs/:cid
      if (req.method === 'GET' && req.url.startsWith('/ipfs/')) {
        const cid = req.url.replace('/ipfs/', '').split('?')[0];
        if (ipfsStorage.has(cid)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(ipfsStorage.get(cid));
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('IPFS Block Not Found');
        }
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    daemonUrl = `http://127.0.0.1:${port}`;
    console.log(`[Mock Test Daemon] Running on ${daemonUrl}`);

    process.env.IPFS_API_URL = daemonUrl;
    process.env.IPFS_GATEWAY_URL = daemonUrl;
  } else {
    console.log(`\n[AUDIT NOTICE] Running against externally configured node: ${daemonUrl}`);
    console.log('[CLASSIFICATION: A/B] Real IPFS Node Mode Active');
  }

  try {
    // 2. USER A: Generate canonical grievance description payload
    console.log('\n--- Step 1: User A generates canonical grievance description ---');
    const grievanceInput = {
      title: 'Water pipe leakage on 5th Ave',
      description: 'Main municipal water supply pipe has burst causing flooding across the roadway.',
      departmentId: 2,
      categoryId: 3,
      priority: 2,
      timestamp: 1716000000,
    };

    const canonicalPayload = createCanonicalDescriptionPayload(grievanceInput);
    console.log('Canonical Payload:\n', canonicalPayload);

    const expectedContentHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalPayload));
    console.log('Expected On-Chain Hash (Keccak-256):', expectedContentHash);

    // 3. USER A: Publish to the IPFS network
    console.log('\n--- Step 2: User A publishes content to the IPFS network ---');
    const publishResult = await uploadText(canonicalPayload);
    console.log('Upload Result from ipfs.js:', publishResult);

    if (!publishResult.persisted) {
      throw new Error('FAILED: Content was not marked as persisted to IPFS.');
    }
    if (publishResult.mode !== 'IPFS_PUBLISHED') {
      throw new Error(`FAILED: Mode should be IPFS_PUBLISHED, got ${publishResult.mode}`);
    }
    if (!publishResult.gatewayUrl.startsWith(daemonUrl)) {
      throw new Error('FAILED: Gateway URL does not point to IPFS gateway.');
    }
    if (publishResult.contentHash !== expectedContentHash) {
      throw new Error('FAILED: Content hash does not match expected on-chain commitment.');
    }

    console.log('✓ Successfully published to IPFS network with CID:', publishResult.cid);

    // 4. USER B: Cross-User Retrieval WITHOUT relying on local cache
    console.log('\n--- Step 3: User B retrieves content independently via IPFS Gateway ---');
    console.log('(Running in isolated mode with allowCacheFallback: false)');

    const retrievalResult = await fetchFromIpfs(publishResult.cid, {
      customGateway: daemonUrl,
      allowCacheFallback: false, // Strictly forbid local cache fallback
    });

    console.log('Retrieval Source:', retrievalResult.retrievalSource);
    console.log('Is From Network:', retrievalResult.isFromNetwork);
    console.log('Retrieved Payload Content:\n', retrievalResult.content);

    if (!retrievalResult.isFromNetwork) {
      throw new Error('FAILED: Content was not retrieved over the IPFS network.');
    }
    if (retrievalResult.content !== canonicalPayload) {
      throw new Error('FAILED: Retrieved content does not match the published canonical payload.');
    }

    // 5. USER B: Recompute Keccak-256 and verify against on-chain hash commitment
    console.log('\n--- Step 4: Cryptographic Hash Verification ---');
    const recomputedHash = computeContentHash(retrievalResult.content);
    console.log('Recomputed Hash: ', recomputedHash);
    console.log('On-Chain Hash:   ', expectedContentHash);

    if (recomputedHash.toLowerCase() !== expectedContentHash.toLowerCase()) {
      throw new Error('FAILED: Recomputed hash does not match the on-chain hash commitment!');
    }
    console.log('✓ Cryptographic Hash Commitment MATCHES 100%');

    // 6. Test Tamper Detection
    console.log('\n--- Step 5: Tamper Detection Verification ---');
    const tamperedPayload = canonicalPayload.replace('flooding', 'dry weather');
    const tamperedHash = computeContentHash(tamperedPayload);
    console.log('Tampered Hash:   ', tamperedHash);

    if (tamperedHash.toLowerCase() === expectedContentHash.toLowerCase()) {
      throw new Error('FAILED: Tampered content produced an identical hash!');
    }
    console.log('✓ Tamper detection verified: Altered content produces a hash mismatch.');

    console.log('\n====================================================');
    console.log('✅ IPFS ADAPTER & PROTOCOL TEST COMPLETED SUCCESSFULLY');
    console.log('====================================================');
    if (!isRealKubo) {
      console.log('Note: This test verified the HTTP adapter and cross-context retrieval');
      console.log('against an emulated daemon. For real decentralized network verification,');
      console.log('start a genuine Kubo node and provide IPFS_API_URL.\n');
    }
  } finally {
    // 7. Clean up daemon server if started in-process
    if (server) {
      server.close();
    }
    delete process.env.IPFS_API_URL;
    delete process.env.IPFS_GATEWAY_URL;
  }
}

runCrossUserIpfsTest().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
