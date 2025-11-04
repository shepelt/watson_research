# Scripts Reference Guide

**Detailed documentation for each script in the deployment process**

---

## Overview

This directory contains 6 essential scripts for deploying and managing an Arbitrum Orbit L3:

1. **deploy-l3-fast-delay.ts** - Deploy L3 with custom 60-second delay
2. **stake-validator-v2.ts** - Stake validator on Rollup
3. **launch-sequencer-v2.sh** - Start Nitro sequencer with proper configuration
4. **deposit-to-l3-v2.ts** - Make ETH deposits from L2 to L3
5. **spam-l2-blocks.ts** - Generate L2 blocks to meet force-include threshold
6. **test-l3-tx.ts** - Test L3 transaction execution and balance

---

## Script Details

### 1. deploy-l3-fast-delay.ts

**Purpose**: Deploy a complete Arbitrum Orbit L3 with custom 60-second force-include delay

**Usage**:
```bash
npx tsx scripts/deploy-l3-fast-delay.ts
```

**What it does**:
1. Deploys a new ERC20 stake token (WST - Watson Stake Token)
2. Constructs `RollupCreator.createRollup()` parameters with custom settings
3. Sets `sequencerInboxMaxTimeVariation`:
   - `delaySeconds: 60` (instead of default 86400)
   - `delayBlocks: 12` (instead of default 7200)
   - `futureSeconds: 3600`
   - `futureBlocks: 12`
4. Calls `RollupCreator.createRollup()` on parent L2
5. Deploys 32+ Arbitrum Orbit contracts:
   - Rollup (main state management)
   - Inbox (L2→L3 messages)
   - Outbox (L3→L2 messages)
   - Bridge (asset transfers)
   - SequencerInbox (transaction batches)
   - ChallengeManager (fraud proofs)
   - And many more...
6. Saves deployment addresses to `deployment.json`

**Key Configuration**:
```typescript
const config = {
  confirmPeriodBlocks: BigInt(20),      // Fast challenge period for testing
  extraChallengeTimeBlocks: BigInt(10),
  stakeToken: stakeTokenAddress,        // Custom ERC20 stake token
  baseStake: parseEther("0.1"),         // 0.1 tokens to stake
  wasmModuleRoot: "0x184884e1eb9fefdc158f6c8ac912bb183bf3cf83f0090317e0bc4ac5860baa39",
  owner: account.address,
  loserStakeEscrow: zeroAddress,
  chainId: BigInt(987654322),           // Your L3 chain ID
  chainConfig: JSON.stringify(/* ... */),
  genesisBlockNum: BigInt(0),
  sequencerInboxMaxTimeVariation: {
    delayBlocks: BigInt(12),            // ← Custom!
    futureBlocks: BigInt(12),
    delaySeconds: BigInt(60),           // ← Custom! (60 seconds)
    futureSeconds: BigInt(3600),
  }
}
```

**Output**:
- `deployment.json` - Contains all deployed contract addresses
- Console log with deployment summary

**Duration**: ~30 minutes (depends on L2 network)

**Prerequisites**:
- Private key with funds on parent L2 (for gas)
- Parent L2 RPC URL in `.env`
- RollupCreator deployed on parent L2 (usually at known address)

**Critical Note**: This script bypasses the Arbitrum Orbit SDK to enable custom force-include delays. The SDK hardcodes 24-hour delays with no customization option.

---

### 2. stake-validator-v2.ts

**Purpose**: Stake tokens and register as a validator on the Rollup

**Usage**:
```bash
npx tsx scripts/stake-validator-v2.ts
```

**What it does**:
1. Reads deployment addresses from `deployment.json`
2. Approves stake token (WST) for Rollup contract
3. Calls `Rollup.newStake(tokenAmount, withdrawalAddress)`
4. Registers caller as a validator

**Process**:
```typescript
// 1. Approve stake token
await walletClient.writeContract({
  address: stakeTokenAddress,
  abi: erc20ABI,
  functionName: 'approve',
  args: [rollupAddress, parseEther('0.1')]
});

// 2. Stake
await walletClient.writeContract({
  address: rollupAddress,
  abi: rollupABI,
  functionName: 'newStake',
  args: [parseEther('0.1'), account.address]
});
```

**Output**:
```
Approving 0.1 WST...
✅ Approved
Staking 0.1 WST...
Transaction sent: 0x...
✅ Staked!
Block: 1874
```

**Duration**: ~2 minutes

**Prerequisites**:
- `deployment.json` exists (from deploy-l3-fast-delay.ts)
- Stake token balance ≥ 0.1 tokens
- Private key with funds for gas

**Why needed**: Validators secure the L3 by posting state assertions and challenging invalid states.

---

### 3. launch-sequencer-v2.sh

**Purpose**: Launch Arbitrum Nitro sequencer node with proper delayed message processing configuration

**Usage**:
```bash
chmod +x scripts/launch-sequencer-v2.sh
./scripts/launch-sequencer-v2.sh
```

**What it does**:
1. Stops any existing sequencer containers
2. Creates data directory (`~/watson/nitro-data-v2/`)
3. Extracts private key from `.env`
4. Launches Docker container with Nitro node v3.2.1-d81324d
5. Configures sequencer with all necessary flags

**Critical Configuration Flags**:
```bash
# Enable delayed message processing (CRITICAL!)
--node.delayed-sequencer.enable=true
--node.delayed-sequencer.use-merge-finality=false  # ← MUST HAVE
--node.delayed-sequencer.finalize-distance=1       # ← MUST HAVE

# Chain configuration
--chain.id=987654322
--parent-chain.connection.url=https://sepolia.hpp.io

# Sequencer mode
--node.sequencer=true
--node.dangerous.no-sequencer-coordinator=true
--execution.sequencer.enable=true

# Batch posting
--node.batch-poster.enable=true
--node.batch-poster.max-delay=1s
--node.batch-poster.parent-chain-wallet.private-key="..."

# Chain info (includes all contract addresses)
--chain.info-json='[{...}]'
```

**Why `use-merge-finality=false` and `finalize-distance=1` are critical**:
- Without these flags, InboxTracker initializes but NEVER scans for new delayed messages
- These flags tell the sequencer to actively monitor and process force-includable messages
- Default behavior (without flags): InboxTracker loads cached state and sits idle

**Output**:
```
✅ Watson L3 v2 sequencer is running!
Container: watson-l3-v2-sequencer
HTTP RPC: http://localhost:8547
WebSocket: ws://localhost:8548
⚡ FAST MODE: Delayed messages will be force-included after 60 seconds!
```

**Ports**:
- `8547`: HTTP JSON-RPC
- `8548`: WebSocket JSON-RPC

**Data persistence**: `~/watson/nitro-data-v2/` (can be deleted for clean restart)

**Duration**: ~5 seconds to start

**Prerequisites**:
- Docker installed and running
- `deployment.json` exists
- `.env` file with `DEPLOYER_PRIVATE_KEY`
- Ports 8547 and 8548 available

**Troubleshooting**: If sequencer doesn't process delayed messages, the most common cause is missing or incorrect delayed sequencer flags.

---

### 4. deposit-to-l3-v2.ts

**Purpose**: Make ETH deposit from parent L2 to L3

**Usage**:
```bash
npx tsx scripts/deposit-to-l3-v2.ts
```

**What it does**:
1. Reads deployment addresses from `deployment.json`
2. Calls `Inbox.depositEth()` with ETH value
3. Creates a delayed message on L2
4. Waits for transaction confirmation

**Process**:
```typescript
await walletClient.writeContract({
  address: inboxAddress,
  abi: [{
    inputs: [],
    name: 'depositEth',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  }],
  functionName: 'depositEth',
  value: parseEther('0.01')  // 0.01 ETH
});
```

**Output**:
```
=== Depositing to Watson L3 v2 ===

Inbox: 0x2c85415428DBAfC7024c6963A0ED5D37051A93B1
From: 0xF3Ac9af2367393d0faC75ae4d31cAe340ceb0051
Amount: 0.01 ETH

Depositing...
Transaction sent: 0x60dace296b969b6205da61f086a146a656e0ca4f57a4110a25cf9acf5c4e9843
✅ Deposited!
Block: 1912

⚡ With 60-second delay, this should be force-included in ~1 minute!
```

**What happens next**:
1. Deposit creates a delayed message in the Bridge contract
2. Message must wait for force-include threshold:
   - 60 seconds elapsed OR
   - 12 L2 blocks produced (whichever comes first)
3. Once threshold met, sequencer automatically processes the message
4. ETH appears in your L3 balance

**Duration**: ~30 seconds (transaction confirmation)

**Prerequisites**:
- `deployment.json` exists
- Balance on parent L2 ≥ deposit amount + gas
- Sequencer running

**Default amount**: 0.01 ETH (can be modified in script)

---

### 5. spam-l2-blocks.ts

**Purpose**: Generate L2 blocks to meet force-include threshold

**Usage**:
```bash
npx tsx scripts/spam-l2-blocks.ts
```

**What it does**:
1. Creates 15 self-transfer transactions on parent L2
2. Each transaction triggers a new L2 block
3. Advances L2 block count past force-include threshold (12 blocks)

**Process**:
```typescript
for (let i = 0; i < 15; i++) {
  const hash = await walletClient.sendTransaction({
    to: account.address,        // Send to self
    value: parseEther('0.0001')  // Small amount
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Tx ${i + 1}: Block ${receipt.blockNumber}`);

  await new Promise(r => setTimeout(r, 1000));  // Wait 1 second between tx
}
```

**Output**:
```
=== Creating L2 transactions to produce blocks ===

Starting L2 block: 1895n
Creating 15 transactions to trigger 12 blocks...

Tx 1: Block 1896
Tx 2: Block 1897
Tx 3: Block 1898
...
Tx 15: Block 1910

Ending L2 block: 1910n
Blocks created: 15

✅ Done creating L2 blocks!
```

**Why this is needed**:
- Some L2 networks (like HPP Sepolia) only produce blocks when there are transactions
- Force-include requires EITHER 60 seconds OR 12 blocks
- If L2 stops producing blocks naturally, this script forces block production
- Ensures both time-based AND block-based thresholds are met

**Duration**: ~20 seconds (15 tx × 1 second each + confirmations)

**Prerequisites**:
- Balance on parent L2 for gas (small amount needed)
- Parent L2 RPC accessible

**Cost**: Minimal (15 × ~0.0001 ETH for transfers + gas)

**When to use**:
- After making a deposit
- If L2 block production has stalled
- To ensure force-include threshold is definitely met

---

### 6. test-l3-tx.ts

**Purpose**: Test L3 transaction execution and verify balance

**Usage**:
```bash
npx tsx scripts/test-l3-tx.ts
```

**What it does**:
1. Connects to L3 sequencer RPC (http://localhost:8547)
2. Checks chain ID, block number, and balance
3. If balance > 0, sends a test transaction
4. Waits for transaction confirmation
5. Reports success/failure

**Process**:
```typescript
// 1. Check L3 status
const chainId = await publicClient.getChainId();
const blockNumber = await publicClient.getBlockNumber();
const balance = await publicClient.getBalance({ address: account.address });

console.log('Chain ID:', chainId);
console.log('Block Number:', blockNumber.toString());
console.log('Balance:', (Number(balance) / 1e18).toFixed(6), 'ETH');

// 2. If balance exists, send test transaction
if (balance > 0n) {
  const hash = await walletClient.sendTransaction({
    to: account.address,        // Send to self
    value: parseEther('0.0001')  // Small test amount
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log('✅ Transaction confirmed!');
  console.log('Block:', receipt.blockNumber.toString());
  console.log('Gas used:', receipt.gasUsed.toString());
}
```

**Output (Success)**:
```
=== Testing Direct L3 Transaction ===

✅ L3 Sequencer is responsive!
Chain ID: 987654322
Block Number: 11
Balance: 0.020088 ETH

We have balance! Let me send a test transaction...
Transaction sent: 0x920943944c6bf02c8261546eee7d16c97d19130f477947ea5124c231493a99bb
✅ Transaction confirmed!
Block: 12
Gas used: 60927

🎉🎉🎉 L3 IS WORKING! Transactions are being sequenced!
```

**Output (No Balance)**:
```
✅ L3 Sequencer is responsive!
Chain ID: 987654322
Block Number: 0
Balance: 0.000000 ETH

No balance on L3 yet - delayed messages not yet processed.
⏳ Waiting for L2 blocks to advance so force-include can trigger...
```

**Duration**: ~5 seconds

**Prerequisites**:
- Sequencer running on localhost:8547
- (Optional) Balance on L3 for transaction test

**Use cases**:
- Verify L3 is operational
- Check if delayed messages have been processed
- Confirm transaction execution works end-to-end
- Monitor L3 block progression

**Exit codes**:
- 0: Success (L3 operational, test passed)
- 1: Failure (connection error, transaction failed)

---

## Execution Order

**Standard deployment flow**:

```
1. deploy-l3-fast-delay.ts      (30 min)  → Creates deployment.json
     ↓
2. stake-validator-v2.ts        (2 min)   → Stakes validator
     ↓
3. launch-sequencer-v2.sh       (5 sec)   → Starts sequencer
     ↓
4. deposit-to-l3-v2.ts          (30 sec)  → Makes deposit
     ↓
5. spam-l2-blocks.ts            (20 sec)  → Generates L2 blocks
     ↓
   [Wait 60 seconds for force-include]
     ↓
6. test-l3-tx.ts                (5 sec)   → Verifies L3 working
```

**Total time**: ~50-60 minutes (mostly step 1)

---

## Dependencies

All scripts require:
- `viem` - Ethereum library
- `dotenv` - Environment variables
- `tsx` - TypeScript execution
- Node.js 18+

Install:
```bash
npm install viem dotenv
npm install -g tsx
```

---

## Environment Variables

Scripts read from `.env`:
```bash
DEPLOYER_PRIVATE_KEY=0x...       # Used by all scripts
PARENT_RPC_URL=https://...       # Used by deployment/deposit scripts
PARENT_CHAIN_ID=181228           # Used by deployment script
```

---

## Output Files

Scripts generate:
- `deployment.json` - Contract addresses (from deploy-l3-fast-delay.ts)
- Docker volumes - Sequencer data in `~/watson/nitro-data-v2/`
- Console logs - Detailed execution information

---

## Troubleshooting

**Script fails with "Cannot find module"**:
```bash
npm install viem dotenv
```

**Script fails with "DEPLOYER_PRIVATE_KEY not found"**:
```bash
# Create/update .env file
echo "DEPLOYER_PRIVATE_KEY=0xyour_key_here" >> .env
```

**Deployment fails with "RollupCreator not found"**:
- Verify parent L2 RPC URL
- Check RollupCreator address for your L2
- Ensure parent L2 is Arbitrum-based

**Sequencer doesn't process delayed messages**:
- Verify `--node.delayed-sequencer.use-merge-finality=false` in launch script
- Verify `--node.delayed-sequencer.finalize-distance=1` in launch script
- Try clean restart: `rm -rf ~/watson/nitro-data-v2 && ./launch-sequencer-v2.sh`

---

**For more help, see**:
- README.md - Full deployment guide
- TROUBLESHOOTING.md - Detailed problem solving
- SUCCESS_SUMMARY.md - Narrative of successful deployment
