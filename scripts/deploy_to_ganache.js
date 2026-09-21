/**
 * deploy_to_ganache.js
 *
 * Deploys the full Grievance System smart contract suite to a local Ganache instance.
 * Sets up AuditTrail authorizations, seeds test departments, categories, and registered citizen accounts,
 * and generates/updates `frontend/.env` for immediate use with MetaMask.
 *
 * Usage:
 *   node scripts/deploy_to_ganache.js          # Starts server (if not running), deploys, and stays alive
 *   node scripts/deploy_to_ganache.js --exit   # Deploys, writes .env, and exits (for CI/tests)
 */

const { ethers } = require("ethers");
const ganache = require("ganache");
const path = require("path");
const fs = require("fs");

const DEFAULT_PORT = 8545;
const DEFAULT_CHAIN_ID = 1337;
const DETERMINISTIC_MNEMONIC = "myth like bonus scare over problem client lizard pioneer submit female collect";

function loadArtifact(name) {
  const p = path.join(__dirname, "..", "build", `${name}.json`);
  if (!fs.existsSync(p)) {
    throw new Error(`Artifact ${name}.json not found in build/ directory. Run 'node scripts/compile.js' first.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function isPortInUse(port) {
  const net = require("net");
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          resolve(true);
        } else {
          resolve(false);
        }
      })
      .once("listening", () => {
        tester.once("close", () => resolve(false)).close();
      })
      .listen(port);
  });
}

async function main() {
  const shouldExit = process.argv.includes("--exit") || process.argv.includes("--ci");
  const port = process.env.GANACHE_PORT ? parseInt(process.env.GANACHE_PORT, 10) : DEFAULT_PORT;
  const inUse = await isPortInUse(port);

  let ganacheServer = null;
  let providerUrl = `http://127.0.0.1:${port}`;

  if (!inUse) {
    console.log(`Starting local Ganache instance on port ${port} (Chain ID: ${DEFAULT_CHAIN_ID})...`);
    ganacheServer = ganache.server({
      wallet: {
        totalAccounts: 10,
        defaultBalance: 1000,
        mnemonic: DETERMINISTIC_MNEMONIC,
      },
      chain: {
        chainId: DEFAULT_CHAIN_ID,
        networkId: DEFAULT_CHAIN_ID,
      },
      logging: { quiet: true },
    });

    await new Promise((resolve, reject) => {
      ganacheServer.listen(port, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    console.log(`✅ Ganache server listening at ${providerUrl}\n`);
  } else {
    console.log(`Port ${port} is already active. Connecting to existing node at ${providerUrl}...\n`);
  }

  const rawProvider = new ethers.JsonRpcProvider(providerUrl);

  // Buffer gas limit estimates by 50% to prevent Out of Gas on Ganache state transitions
  const origSend = rawProvider.send.bind(rawProvider);
  rawProvider.send = async function (method, params) {
    const res = await origSend(method, params);
    if (method === "eth_estimateGas" && typeof res === "string" && res.startsWith("0x")) {
      const buffered = (BigInt(res) * 150n) / 100n;
      return "0x" + buffered.toString(16);
    }
    return res;
  };

  const accounts = await rawProvider.listAccounts();
  if (accounts.length < 5) {
    throw new Error(`Expected at least 5 accounts, found ${accounts.length}`);
  }

  const superAdmin = accounts[0];
  const deptAdmin = accounts[1];
  const officer1 = accounts[2];
  const citizen1 = accounts[3];
  const citizen2 = accounts[4];

  console.log("==================================================================");
  console.log("DEPLOYING GRIEVANCE SYSTEM TO GANACHE");
  console.log("==================================================================");
  console.log(`SuperAdmin Deployer: ${superAdmin.address}`);

  // 1. Deploy RoleManager
  const RoleManagerArtifact = loadArtifact("RoleManager");
  const RoleManagerFactory = new ethers.ContractFactory(
    RoleManagerArtifact.abi,
    RoleManagerArtifact.bytecode,
    superAdmin
  );
  const roleManager = await RoleManagerFactory.deploy();
  await roleManager.waitForDeployment();
  const roleManagerAddr = await roleManager.getAddress();
  console.log(`✅ RoleManager deployed:       ${roleManagerAddr}`);

  // 2. Deploy DepartmentManager
  const DepartmentManagerArtifact = loadArtifact("DepartmentManager");
  const DeptManagerFactory = new ethers.ContractFactory(
    DepartmentManagerArtifact.abi,
    DepartmentManagerArtifact.bytecode,
    superAdmin
  );
  const deptManager = await DeptManagerFactory.deploy(roleManagerAddr);
  await deptManager.waitForDeployment();
  const deptManagerAddr = await deptManager.getAddress();
  console.log(`✅ DepartmentManager deployed: ${deptManagerAddr}`);

  // 3. Deploy GrievanceSystem
  const GrievanceSystemArtifact = loadArtifact("GrievanceSystem");
  const GrievanceSystemFactory = new ethers.ContractFactory(
    GrievanceSystemArtifact.abi,
    GrievanceSystemArtifact.bytecode,
    superAdmin
  );
  const grievanceSystem = await GrievanceSystemFactory.deploy(roleManagerAddr, deptManagerAddr);
  await grievanceSystem.waitForDeployment();
  const grievanceSystemAddr = await grievanceSystem.getAddress();
  console.log(`✅ GrievanceSystem deployed:    ${grievanceSystemAddr}`);

  // 4. Deploy EscalationManager
  const EscalationManagerArtifact = loadArtifact("EscalationManager");
  const EscalationFactory = new ethers.ContractFactory(
    EscalationManagerArtifact.abi,
    EscalationManagerArtifact.bytecode,
    superAdmin
  );
  const escalationManager = await EscalationFactory.deploy(
    roleManagerAddr,
    deptManagerAddr,
    grievanceSystemAddr
  );
  await escalationManager.waitForDeployment();
  const escalationManagerAddr = await escalationManager.getAddress();
  console.log(`✅ EscalationManager deployed:  ${escalationManagerAddr}`);

  // Wire EscalationManager in GrievanceSystem
  await (await grievanceSystem.connect(superAdmin).setEscalationManager(escalationManagerAddr)).wait();

  // 5. Deploy AuditTrail
  const AuditTrailArtifact = loadArtifact("AuditTrail");
  const AuditTrailFactory = new ethers.ContractFactory(
    AuditTrailArtifact.abi,
    AuditTrailArtifact.bytecode,
    superAdmin
  );
  const auditTrail = await AuditTrailFactory.deploy(roleManagerAddr);
  await auditTrail.waitForDeployment();
  const auditTrailAddr = await auditTrail.getAddress();
  console.log(`✅ AuditTrail deployed:        ${auditTrailAddr}`);

  // 6. Wire AuditTrail Authorized Writers
  console.log("\nAuthorizing contract writers in AuditTrail...");
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(roleManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(deptManagerAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(grievanceSystemAddr, true)).wait();
  await (await auditTrail.connect(superAdmin).setAuthorizedWriter(escalationManagerAddr, true)).wait();

  // 7. Wire AuditTrail in business contracts
  console.log("Setting AuditTrail address in business contracts...");
  await (await roleManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await deptManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await grievanceSystem.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();
  await (await escalationManager.connect(superAdmin).setAuditTrail(auditTrailAddr)).wait();

  // 8. Seed Initial Data for Frontend Testing
  console.log("\nSeeding initial departments, categories, and test roles...");

  // Grant Department Admin role to deptAdmin
  await (await roleManager.connect(superAdmin).grantDepartmentAdminRole(deptAdmin.address)).wait();

  // Grant Officer role to officer1
  await (await roleManager.connect(superAdmin).grantOfficerRole(officer1.address)).wait();

  // Create Departments
  await (await deptManager.connect(superAdmin).createDepartment("Public Works & Sanitation", deptAdmin.address)).wait();
  await (await deptManager.connect(superAdmin).createDepartment("Health & Family Welfare", deptAdmin.address)).wait();

  // Add Officer to Department 1
  await (await deptManager.connect(deptAdmin).addOfficerToDepartment(1, officer1.address)).wait();

  // Create Grievance Categories
  await (await deptManager.connect(superAdmin).createCategory("Road & Pothole Repair", "Road defects, potholes, surface degradation")).wait();
  await (await deptManager.connect(superAdmin).createCategory("Waste Management & Sanitation", "Garbage collection, sewage, environmental cleanup")).wait();
  await (await deptManager.connect(superAdmin).createCategory("Water Supply & Drainage", "Pipeline leaks, water quality, pressure issues")).wait();

  // Register Citizen 1 & Citizen 2 in RoleManager
  await (await roleManager.connect(citizen1).registerCitizen()).wait();
  await (await roleManager.connect(citizen2).registerCitizen()).wait();

  console.log("✅ Seed data populated: 2 Departments, 3 Categories, 2 Registered Citizens.");

  // 9. Write frontend .env file
  const frontendEnvPath = path.join(__dirname, "..", "frontend", ".env");
  let existingEnv = "";
  if (fs.existsSync(frontendEnvPath)) {
    existingEnv = fs.readFileSync(frontendEnvPath, "utf8");
  }

  const envValues = {
    VITE_ROLE_MANAGER_ADDRESS: roleManagerAddr,
    VITE_DEPARTMENT_MANAGER_ADDRESS: deptManagerAddr,
    VITE_GRIEVANCE_SYSTEM_ADDRESS: grievanceSystemAddr,
    VITE_ESCALATION_MANAGER_ADDRESS: escalationManagerAddr,
    VITE_AUDIT_TRAIL_ADDRESS: auditTrailAddr,
    VITE_TARGET_CHAIN_ID: DEFAULT_CHAIN_ID.toString(),
  };

  let newEnv = existingEnv;
  for (const [key, value] of Object.entries(envValues)) {
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(newEnv)) {
      newEnv = newEnv.replace(regex, `${key}=${value}`);
    } else {
      newEnv = newEnv ? `${newEnv}\n${key}=${value}` : `${key}=${value}`;
    }
  }

  // Ensure IPFS defaults if not present
  if (!newEnv.includes("VITE_IPFS_API_URL=")) {
    newEnv += "\n# IPFS Node Configuration (leave empty for local fallback or configure Kubo)\nVITE_IPFS_API_URL=\nVITE_IPFS_GATEWAY_URL=https://ipfs.io\n";
  }

  fs.writeFileSync(frontendEnvPath, newEnv.trim() + "\n", "utf8");
  console.log(`\n✅ Updated ${frontendEnvPath} with deployed addresses!`);

  // Print Summary Table
  console.log("\n==================================================================");
  console.log("METAMASK TEST ACCOUNTS (Mnemonic: " + DETERMINISTIC_MNEMONIC + ")");
  console.log("==================================================================");

  // HDNodeWallet to print private keys
  const mnemonicObj = ethers.Mnemonic.fromPhrase(DETERMINISTIC_MNEMONIC);
  const roles = [
    "SuperAdmin",
    "DeptAdmin",
    "Officer1",
    "Citizen1 (Registered)",
    "Citizen2 (Registered)",
    "Stranger (Unregistered)",
  ];

  for (let i = 0; i < 6; i++) {
    const wallet = ethers.HDNodeWallet.fromMnemonic(mnemonicObj, `m/44'/60'/0'/0/${i}`);
    console.log(`[${roles[i]}]`);
    console.log(`  Address:    ${wallet.address}`);
    console.log(`  PrivateKey: ${wallet.privateKey}`);
  }

  console.log("\n==================================================================");
  console.log("METAMASK NETWORK CONFIGURATION");
  console.log("==================================================================");
  console.log(`  Network Name:    Ganache Local`);
  console.log(`  New RPC URL:     http://127.0.0.1:${port}`);
  console.log(`  Chain ID:        ${DEFAULT_CHAIN_ID}`);
  console.log(`  Currency Symbol: ETH`);
  console.log("==================================================================\n");

  if (shouldExit || !ganacheServer) {
    if (ganacheServer) {
      await ganacheServer.close();
    }
    console.log("Deployment completed successfully. Exiting (--exit flag).");
    process.exit(0);
  } else {
    console.log("Ganache is running. Press Ctrl+C to stop.");
    process.on("SIGINT", async () => {
      console.log("\nShutting down Ganache server...");
      if (ganacheServer) await ganacheServer.close();
      process.exit(0);
    });
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Deployment failed:", err);
    process.exit(1);
  });
}

module.exports = { main };
