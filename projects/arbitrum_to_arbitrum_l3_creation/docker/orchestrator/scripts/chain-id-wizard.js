#!/usr/bin/env node

/**
 * Chain ID Wizard
 *
 * Helps generate and validate chain IDs for Arbitrum Orbit L3 deployments.
 *
 * Usage:
 *   node scripts/chain-id-wizard.js
 *   node scripts/chain-id-wizard.js --random
 *   node scripts/chain-id-wizard.js --check 987654323
 */

import { createPublicClient, http } from 'viem';
import * as readline from 'readline';

const CHAINLIST_API = 'https://chainid.network/chains.json';

// Known chain ID ranges and their purposes
const CHAIN_ID_RANGES = {
  mainnet: { min: 1, max: 999, description: 'Public mainnets (RESERVED)' },
  testnet: { min: 1000, max: 9999, description: 'Public testnets' },
  private: { min: 10000, max: 99999, description: 'Private/development chains' },
  orbit: { min: 100000, max: 999999999, description: 'Arbitrum Orbit L2s/L3s (RECOMMENDED)' },
};

// Generate a random chain ID in a safe range
function generateRandomChainId(range = 'orbit') {
  const { min, max } = CHAIN_ID_RANGES[range];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a timestamp-based chain ID
function generateTimestampChainId(prefix = 420) {
  const timestamp = Math.floor(Date.now() / 1000);
  const shortened = timestamp % 1000000; // Last 6 digits
  return prefix * 1000000 + shortened;
}

// Generate a sequential chain ID based on parent chain
function generateSequentialChainId(parentChainId, sequence = 1) {
  // For parent 181228, generate 181228001, 181228002, etc.
  return parentChainId * 1000 + sequence;
}

// Check if chain ID is in a reserved range
function checkReservedRange(chainId) {
  if (chainId >= 1 && chainId <= 999) {
    return { reserved: true, reason: 'Reserved for public mainnets', severity: 'error' };
  }
  if (chainId >= 1000 && chainId <= 9999) {
    return { reserved: true, reason: 'Typically used by public testnets', severity: 'warning' };
  }
  return { reserved: false };
}

// Fetch chain list from chainid.network
async function fetchKnownChains() {
  try {
    const response = await fetch(CHAINLIST_API);
    const chains = await response.json();
    return chains;
  } catch (error) {
    console.log('⚠️  Could not fetch chain list from chainid.network (offline check only)');
    return [];
  }
}

// Check if chain ID conflicts with known chains
async function checkConflicts(chainId) {
  const chains = await fetchKnownChains();
  const conflict = chains.find(c => c.chainId === chainId);

  if (conflict) {
    return {
      conflict: true,
      chain: conflict,
      message: `Conflicts with ${conflict.name} (${conflict.shortName})`
    };
  }

  return { conflict: false };
}

// Validate chain ID
async function validateChainId(chainId) {
  const issues = [];
  const warnings = [];

  // Check if it's a valid number
  if (isNaN(chainId) || chainId <= 0) {
    issues.push('Chain ID must be a positive number');
    return { valid: false, issues, warnings };
  }

  // Check if it fits in uint64
  if (chainId > Number.MAX_SAFE_INTEGER) {
    issues.push('Chain ID too large (exceeds JavaScript safe integer)');
  }

  if (chainId > 18446744073709551615n) {
    issues.push('Chain ID too large (exceeds uint64)');
  }

  // Check reserved ranges
  const reservedCheck = checkReservedRange(chainId);
  if (reservedCheck.reserved) {
    if (reservedCheck.severity === 'error') {
      issues.push(reservedCheck.reason);
    } else {
      warnings.push(reservedCheck.reason);
    }
  }

  // Check conflicts with known chains
  const conflictCheck = await checkConflicts(chainId);
  if (conflictCheck.conflict) {
    issues.push(conflictCheck.message);
  }

  // Recommendations
  if (chainId < 100000 && chainId >= 10000) {
    warnings.push('Consider using 100000+ range for Arbitrum Orbit chains');
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings
  };
}

// Display chain ID info
function displayChainIdInfo(chainId) {
  console.log('\n' + '='.repeat(60));
  console.log(`Chain ID: ${chainId}`);
  console.log('='.repeat(60));

  // Find which range it belongs to
  for (const [name, range] of Object.entries(CHAIN_ID_RANGES)) {
    if (chainId >= range.min && chainId <= range.max) {
      console.log(`Range: ${name} (${range.description})`);
      break;
    }
  }

  // Display binary representation (useful for understanding bit patterns)
  console.log(`Hex: 0x${chainId.toString(16)}`);
  console.log(`Binary: 0b${chainId.toString(2)}`);
  console.log(`Digits: ${chainId.toString().length}`);
}

// Interactive wizard
async function runWizard() {
  console.log('\n🧙 Chain ID Wizard for Arbitrum Orbit L3\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  console.log('Choose a generation method:');
  console.log('  1. Random (recommended for testing)');
  console.log('  2. Timestamp-based (unique per deployment)');
  console.log('  3. Sequential (based on parent chain ID)');
  console.log('  4. Custom (enter your own)');
  console.log('  5. Check existing chain ID\n');

  const choice = await question('Enter choice (1-5): ');

  let chainId;

  switch (choice.trim()) {
    case '1':
      chainId = generateRandomChainId('orbit');
      console.log(`\n✨ Generated random chain ID: ${chainId}`);
      break;

    case '2':
      const prefix = await question('Enter prefix (default: 420): ');
      chainId = generateTimestampChainId(parseInt(prefix) || 420);
      console.log(`\n✨ Generated timestamp-based chain ID: ${chainId}`);
      break;

    case '3':
      const parentId = await question('Enter parent chain ID: ');
      const seq = await question('Enter sequence number (1-999): ');
      chainId = generateSequentialChainId(parseInt(parentId), parseInt(seq) || 1);
      console.log(`\n✨ Generated sequential chain ID: ${chainId}`);
      break;

    case '4':
      const custom = await question('Enter custom chain ID: ');
      chainId = parseInt(custom);
      break;

    case '5':
      const check = await question('Enter chain ID to check: ');
      chainId = parseInt(check);
      break;

    default:
      console.log('Invalid choice');
      rl.close();
      return;
  }

  // Validate the chain ID
  displayChainIdInfo(chainId);

  console.log('\n⏳ Validating chain ID...\n');
  const validation = await validateChainId(chainId);

  if (validation.valid) {
    console.log('✅ Chain ID is valid!\n');
  } else {
    console.log('❌ Chain ID has issues:\n');
    validation.issues.forEach(issue => {
      console.log(`  ❌ ${issue}`);
    });
  }

  if (validation.warnings.length > 0) {
    console.log('\n⚠️  Warnings:\n');
    validation.warnings.forEach(warning => {
      console.log(`  ⚠️  ${warning}`);
    });
  }

  // Offer to update .env
  if (validation.valid || validation.issues.length === 0) {
    console.log('\n' + '='.repeat(60));
    console.log('To use this chain ID, update your .env file:');
    console.log('='.repeat(60));
    console.log(`L3_CHAIN_ID=${chainId}`);
    console.log('='.repeat(60));

    const update = await question('\nUpdate .env file now? (y/n): ');
    if (update.toLowerCase() === 'y') {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const { fileURLToPath } = await import('url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const envPath = path.join(__dirname, '..', '.env');

        let envContent = fs.readFileSync(envPath, 'utf-8');
        envContent = envContent.replace(/L3_CHAIN_ID=\d+/, `L3_CHAIN_ID=${chainId}`);
        fs.writeFileSync(envPath, envContent);

        console.log('✅ Updated .env file with new chain ID!');
      } catch (error) {
        console.log(`❌ Could not update .env: ${error.message}`);
      }
    }
  }

  rl.close();
}

// CLI mode
async function runCli() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    return runWizard();
  }

  const command = args[0];

  switch (command) {
    case '--random':
    case '-r':
      const chainId = generateRandomChainId('orbit');
      console.log(chainId);
      break;

    case '--timestamp':
    case '-t':
      const prefix = parseInt(args[1]) || 420;
      console.log(generateTimestampChainId(prefix));
      break;

    case '--sequential':
    case '-s':
      const parentId = parseInt(args[1]);
      const seq = parseInt(args[2]) || 1;
      if (!parentId) {
        console.error('Usage: --sequential <parent-chain-id> [sequence]');
        process.exit(1);
      }
      console.log(generateSequentialChainId(parentId, seq));
      break;

    case '--check':
    case '-c':
      const checkId = parseInt(args[1]);
      if (!checkId) {
        console.error('Usage: --check <chain-id>');
        process.exit(1);
      }
      displayChainIdInfo(checkId);
      const validation = await validateChainId(checkId);

      console.log('\nValidation Results:');
      if (validation.valid) {
        console.log('✅ Valid');
      } else {
        console.log('❌ Invalid');
        validation.issues.forEach(issue => console.log(`  - ${issue}`));
      }

      if (validation.warnings.length > 0) {
        console.log('\nWarnings:');
        validation.warnings.forEach(warning => console.log(`  ⚠️  ${warning}`));
      }
      break;

    case '--help':
    case '-h':
      console.log(`
Chain ID Wizard - Generate and validate chain IDs for Arbitrum Orbit

Usage:
  node scripts/chain-id-wizard.js                    Interactive wizard
  node scripts/chain-id-wizard.js --random           Generate random chain ID
  node scripts/chain-id-wizard.js --timestamp [pfx]  Generate timestamp-based ID
  node scripts/chain-id-wizard.js --sequential <parent> [seq]  Generate sequential ID
  node scripts/chain-id-wizard.js --check <id>       Validate existing chain ID

Examples:
  node scripts/chain-id-wizard.js --random
  node scripts/chain-id-wizard.js --timestamp 420
  node scripts/chain-id-wizard.js --sequential 181228 1
  node scripts/chain-id-wizard.js --check 987654323

Chain ID Ranges:
  1-999:       Reserved for public mainnets (avoid)
  1000-9999:   Public testnets (avoid)
  10000+:      Private/development chains (safe)
  100000+:     Arbitrum Orbit L2s/L3s (recommended)
      `);
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Use --help for usage information');
      process.exit(1);
  }
}

// Run the wizard
runCli().catch(console.error);
