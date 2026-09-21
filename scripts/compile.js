const fs = require("fs");
const path = require("path");
const solc = require("solc");

const contractsDir = path.join(__dirname, "..", "contracts");
const buildDir = path.join(__dirname, "..", "build");

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const sources = {};
const contractFiles = [
  "GrievanceTypes.sol",
  "IAuditTrail.sol",
  "RoleManager.sol",
  "DepartmentManager.sol",
  "GrievanceSystem.sol",
  "EscalationManager.sol",
  "AuditTrail.sol"
];

for (const file of contractFiles) {
  const filePath = path.join(contractsDir, file);
  sources[file] = { content: fs.readFileSync(filePath, "utf8") };
}

function findImports(importPath) {
  if (importPath.startsWith("@openzeppelin/")) {
    const fullPath = path.join(__dirname, "..", "node_modules", importPath);
    if (fs.existsSync(fullPath)) {
      return { contents: fs.readFileSync(fullPath, "utf8") };
    }
  }
  const localPath = path.join(contractsDir, importPath.replace("./", ""));
  if (fs.existsSync(localPath)) {
    return { contents: fs.readFileSync(localPath, "utf8") };
  }
  return { error: `File not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources: sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    evmVersion: "shanghai",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode", "evm.deployedBytecode"]
      }
    }
  }
};

console.log("Compiling contracts with solc " + solc.version() + "...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasErrors = false;
if (output.errors) {
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error(err.formattedMessage);
      hasErrors = true;
    } else {
      console.warn(err.formattedMessage);
    }
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log("\n=== COMPILATION SUCCESSFUL ===");
console.log("Deployed Bytecode Sizes (EIP-170 limit: 24,576 bytes):");
const artifacts = {};

for (const [sourceFile, contracts] of Object.entries(output.contracts)) {
  for (const [contractName, data] of Object.entries(contracts)) {
    const bytecode = data.evm.bytecode.object;
    const deployedBytecode = data.evm.deployedBytecode.object;
    const deployedSize = deployedBytecode ? deployedBytecode.length / 2 : 0;
    
    if (deployedSize > 0) {
      console.log(`- ${contractName} (${sourceFile}): ${deployedSize} bytes ${deployedSize > 24576 ? "⚠️ EXCEEDS LIMIT!" : "✅ OK"}`);
      artifacts[contractName] = {
        contractName,
        sourceFile,
        abi: data.abi,
        bytecode: bytecode,
        deployedBytecode: deployedBytecode,
        deployedSize
      };
      fs.writeFileSync(
        path.join(buildDir, `${contractName}.json`),
        JSON.stringify(artifacts[contractName], null, 2)
      );
    }
  }
}

console.log("\nArtifacts saved to build/ directory.");
