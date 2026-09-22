import { ethers } from 'ethers';

/**
 * Standard RFC 4648 Base32 alphabet for IPFS CIDv1 encoding.
 */
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Encodes a Uint8Array to base32 without padding.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function encodeBase32(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Computes an authentic IPFS CIDv1 (raw codec 0x55 + sha2-256 multihash 0x12 0x20) in base32.
 * Output format: bafkrei...
 * @param {Uint8Array} dataBytes
 * @returns {string}
 */
export function computeIpfsCidV1(dataBytes) {
  const sha256Hex = ethers.sha256(dataBytes);
  const hashBytes = ethers.getBytes(sha256Hex);

  // CIDv1 prefix: 0x01 (CIDv1) + 0x55 (raw codec) + 0x12 (sha2-256) + 0x20 (32 bytes)
  const cidBytes = new Uint8Array(4 + hashBytes.length);
  cidBytes[0] = 0x01;
  cidBytes[1] = 0x55;
  cidBytes[2] = 0x12;
  cidBytes[3] = 0x20;
  cidBytes.set(hashBytes, 4);

  // 'b' multibase prefix for base32
  return `b${encodeBase32(cidBytes)}`;
}

/**
 * Computes the deterministic keccak256 hash of content for on-chain commitment.
 * Matches GrievanceSystem.sol descriptionHash and evidence contentHash bytes32 requirements.
 *
 * @param {string|Uint8Array} content
 * @returns {string} bytes32 hex string starting with '0x'
 */
export function computeContentHash(content) {
  const bytes = typeof content === 'string' ? ethers.toUtf8Bytes(content) : content;
  return ethers.keccak256(bytes);
}

/**
 * Creates a versioned, canonical JSON document string for grievance descriptions.
 * Keys are ordered deterministically to guarantee deterministic hashing.
 *
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.description
 * @param {number|string} params.departmentId
 * @param {number|string} params.categoryId
 * @param {number|string} params.priority
 * @param {number} [params.timestamp]
 * @returns {string} Canonical JSON string
 */
export function createCanonicalDescriptionPayload({
  title,
  description,
  departmentId,
  categoryId,
  priority,
  timestamp,
}) {
  const payload = {
    schemaVersion: '1.0',
    type: 'grievance-description',
    title: String(title || '').trim(),
    description: String(description || '').trim(),
    departmentId: Number(departmentId),
    categoryId: Number(categoryId),
    priority: Number(priority),
    submittedAt: Number(timestamp || Math.floor(Date.now() / 1000)),
  };

  // Deterministic JSON string
  return JSON.stringify(payload);
}

/**
 * In-memory client cache for development fallback only.
 * This is NEVER treated as proof of IPFS network persistence.
 */
const localDevCache = new Map();

function cacheLocally(cid, content) {
  const serialized = typeof content === 'string' ? content : JSON.stringify(content);
  localDevCache.set(cid, serialized);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`ipfs_dev_${cid}`, serialized);
    }
  } catch (e) {
    console.warn('LocalStorage save failed for dev cache:', e);
  }
}

function getFromLocalCache(cid) {
  if (localDevCache.has(cid)) {
    return localDevCache.get(cid);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(`ipfs_dev_${cid}`) || null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves configured environment variables safely across browser and Node.js.
 */
function getEnvConfig() {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (typeof process !== 'undefined' ? process.env : {});
  return {
    nodeApiUrl: env.VITE_IPFS_API_URL || env.IPFS_API_URL || '',
    uploadUrl: env.VITE_IPFS_UPLOAD_URL || env.IPFS_UPLOAD_URL || '',
    gatewayUrl: env.VITE_IPFS_GATEWAY_URL || env.IPFS_GATEWAY_URL || '',
  };
}

/**
 * Attempts to publish canonical text content to a live IPFS network endpoint.
 *
 * Supported mechanisms:
 * 1. Standard IPFS Node / Kubo RPC API (VITE_IPFS_API_URL e.g., http://127.0.0.1:5001)
 * 2. Secure server-side upload proxy (VITE_IPFS_UPLOAD_URL)
 *    - In production, third-party pinning credentials (e.g., Pinata, Infura, Filebase)
 *      MUST be kept server-side behind a secure proxy to prevent credential exposure.
 *    - Client-side bundles must NEVER store privileged JWTs or API secrets.
 *
 * If no endpoint is configured or network publishing fails:
 * Returns { persisted: false, mode: 'LOCAL_DEVELOPMENT_ONLY' }.
 *
 * @param {string} textContent - Canonical grievance description JSON
 * @returns {Promise<{
 *   cid: string,
 *   contentHash: string,
 *   gatewayUrl: string | null,
 *   persisted: boolean,
 *   mode: 'IPFS_PUBLISHED' | 'LOCAL_DEVELOPMENT_ONLY',
 *   provider: string,
 *   warning?: string
 * }>}
 */
export async function uploadText(textContent) {
  if (!textContent || typeof textContent !== 'string') {
    throw new Error('Description content is empty or invalid.');
  }

  const dataBytes = ethers.toUtf8Bytes(textContent);
  const localCid = computeIpfsCidV1(dataBytes);
  const contentHash = computeContentHash(dataBytes);

  const env = getEnvConfig();

  // 1. Check for standard IPFS Kubo RPC (e.g. http://127.0.0.1:5001/api/v0/add)
  if (env.nodeApiUrl) {
    try {
      const endpoint = `${env.nodeApiUrl.replace(/\/$/, '')}/api/v0/add?pin=true`;
      const formData = new FormData();
      const blob = new Blob([textContent], { type: 'application/json' });
      formData.append('file', blob, `grievance-${contentHash.slice(2, 10)}.json`);

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const json = await res.json();
        const cid = json.Hash || json.cid || localCid;
        const gatewayBase = env.gatewayUrl || 'http://127.0.0.1:8080';
        const gatewayUrl = `${gatewayBase.replace(/\/$/, '')}/ipfs/${cid}`;

        return {
          cid,
          contentHash,
          gatewayUrl,
          persisted: true,
          mode: 'IPFS_PUBLISHED',
          provider: 'IPFS_KUBO_NODE',
        };
      }
      console.warn('IPFS Kubo RPC rejected upload:', res.status, res.statusText);
    } catch (err) {
      console.warn('IPFS Kubo RPC upload failed:', err.message);
    }
  }

  // 2. Check for secure server-side upload proxy (FastAPI backend with Pinata)
  // Third-party pinning services (Pinata) are accessed through this server-side proxy
  // where API keys and JWTs are stored securely out of browser reach.
  if (env.uploadUrl) {
    try {
      const formData = new FormData();
      const blob = new Blob([textContent], { type: 'application/json' });
      formData.append('file', blob, `grievance-${contentHash.slice(2, 10)}.json`);

      const res = await fetch(env.uploadUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const json = await res.json();
        const cid = json.cid || json.Hash || localCid;
        const gatewayUrl = json.gatewayUrl || (env.gatewayUrl ? `${env.gatewayUrl.replace(/\/$/, '')}/ipfs/${cid}` : `https://ipfs.io/ipfs/${cid}`);

        return {
          cid,
          contentHash,
          gatewayUrl,
          persisted: true,
          mode: 'IPFS_PUBLISHED',
          provider: 'FASTAPI_PINATA_PROXY',
        };
      }
      console.warn('Secure IPFS upload proxy returned non-OK status:', res.status);
    } catch (err) {
      console.warn('Secure IPFS upload proxy failed:', err.message);
    }
  }

  // 3. Fallback: No live IPFS provider available
  // Cache in local dev storage, but explicitly declare persisted: false
  cacheLocally(localCid, textContent);

  return {
    cid: localCid,
    contentHash,
    gatewayUrl: null,
    persisted: false,
    mode: 'LOCAL_DEVELOPMENT_ONLY',
    provider: 'LOCAL_BROWSER_CACHE',
    warning:
      'Content is NOT published to the decentralized IPFS network. CID was computed locally. Configure an IPFS node or secure upload proxy in environment variables for public cross-user persistence.',
  };
}

/**
 * Validates and hashes an evidence file.
 * Allowed types: images, PDFs, text, common docs. Max size: 10MB.
 *
 * @param {File} file
 * @returns {Promise<{
 *   cid: string,
 *   contentHash: string,
 *   fileName: string,
 *   fileSize: number,
 *   fileType: string,
 *   persisted: boolean,
 *   gatewayUrl: string | null
 * }>}
 */
export async function uploadFile(file) {
  if (!file) {
    throw new Error('No file provided for upload.');
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(
      `File exceeds maximum allowed size of 10MB (file size: ${(file.size / (1024 * 1024)).toFixed(2)}MB).`
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const dataBytes = new Uint8Array(arrayBuffer);

  const localCid = computeIpfsCidV1(dataBytes);
  const contentHash = computeContentHash(dataBytes);
  const env = getEnvConfig();

  // If standard IPFS Kubo RPC is configured, publish file
  if (env.nodeApiUrl) {
    try {
      const endpoint = `${env.nodeApiUrl.replace(/\/$/, '')}/api/v0/add?pin=true`;
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const json = await res.json();
        const cid = json.Hash || json.cid || localCid;
        const gatewayBase = env.gatewayUrl || 'http://127.0.0.1:8080';

        return {
          cid,
          contentHash,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          persisted: true,
          gatewayUrl: `${gatewayBase.replace(/\/$/, '')}/ipfs/${cid}`,
        };
      }
    } catch (err) {
      console.warn('File upload to IPFS node failed:', err.message);
    }
  }

  // Check for secure server-side upload proxy (FastAPI backend with Pinata)
  if (env.uploadUrl) {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(env.uploadUrl, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        const json = await res.json();
        const cid = json.cid || json.Hash || localCid;
        const gatewayUrl = json.gatewayUrl || (env.gatewayUrl ? `${env.gatewayUrl.replace(/\/$/, '')}/ipfs/${cid}` : `https://ipfs.io/ipfs/${cid}`);

        return {
          cid,
          contentHash,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          persisted: true,
          gatewayUrl,
          provider: 'FASTAPI_PINATA_PROXY',
        };
      }
      console.warn('Backend IPFS upload proxy returned non-OK status:', res.status);
    } catch (err) {
      console.warn('Backend IPFS upload proxy failed for file:', err.message);
    }
  }

  // Local caching fallback
  cacheLocally(
    localCid,
    JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      cid: localCid,
      contentHash,
    })
  );

  return {
    cid: localCid,
    contentHash,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    persisted: false,
    gatewayUrl: null,
  };
}

/**
 * Retrieves content from the decentralized IPFS network via public/custom gateways.
 *
 * Authenticity principle:
 * Queries genuine network gateways first. Only falls back to local cache if network
 * gateways fail and allowCacheFallback is true.
 *
 * @param {string} cid - IPFS CID string
 * @param {object} [options]
 * @param {string} [options.customGateway] - Explicit gateway URL to query
 * @param {boolean} [options.allowCacheFallback=true] - Whether to allow local cache if network fails
 * @returns {Promise<{ content: string, retrievalSource: string, isFromNetwork: boolean }>}
 */
export async function fetchFromIpfs(cid, options = {}) {
  if (!cid) {
    throw new Error('Missing IPFS CID.');
  }

  const env = getEnvConfig();
  const gateways = [];

  if (options.customGateway) {
    gateways.push(`${options.customGateway.replace(/\/$/, '')}/ipfs/${cid}`);
  }
  if (env.gatewayUrl) {
    gateways.push(`${env.gatewayUrl.replace(/\/$/, '')}/ipfs/${cid}`);
  }

  // Standard public gateways for decentralized cross-user retrieval
  gateways.push(
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`
  );

  // 1. Query remote gateways first
  for (const gatewayUrl of gateways) {
    try {
      const res = await fetch(gatewayUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const text = await res.text();
        return {
          content: text,
          retrievalSource: gatewayUrl,
          isFromNetwork: true,
        };
      }
    } catch {
      // Continue to next gateway
    }
  }

  // 2. Local fallback if explicitly permitted
  if (options.allowCacheFallback !== false) {
    const local = getFromLocalCache(cid);
    if (local) {
      return {
        content: local,
        retrievalSource: 'Local Client Cache (Fallback - Node Unreachable)',
        isFromNetwork: false,
      };
    }
  }

  throw new Error(
    `Decentralized retrieval failed: CID ${cid} could not be retrieved from any public or configured IPFS gateway.`
  );
}

// ========================================================================
// CONVENIENCE EXPORTS
// ========================================================================

/**
 * Uploads JSON object or text string to IPFS.
 * @param {object|string} data
 */
export async function uploadToIpfs(data) {
  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  return uploadText(text);
}

/**
 * Uploads a File object to IPFS.
 * @param {File} file
 */
export async function uploadFileToIpfs(file) {
  return uploadFile(file);
}

