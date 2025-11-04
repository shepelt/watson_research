# Arbitrum L2 → L3 Deployment Guide

**Complete guide to deploying an Arbitrum Orbit L3 on an Arbitrum L2 parent chain with custom force-include delay**

---

## Table of Contents

1. [Overview](#overview)
2. [What We Achieved](#what-we-achieved)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Deployment](#step-by-step-deployment)
5. [Critical Discoveries](#critical-discoveries)
6. [Troubleshooting](#troubleshooting)
7. [Files Reference](#files-reference)

---

## Overview

This project successfully deployed a fully functional Arbitrum Orbit L3 rollup on HPP Sepolia (an Arbitrum L2 testnet) with a **custom 60-second force-include delay** instead of the default 24 hours.

### Key Innovation

**Problem**: The Arbitrum Orbit SDK hardcodes a 24-hour force-include delay with no customization options, making rapid testing impossible.

**Solution**: Bypass the SDK entirely and manually call `RollupCreator.createRollup()` with custom `sequencerInboxMaxTimeVariation` parameters.

### Architecture Deployed

```
Ethereum L1 (Sepolia)
    ↓
HPP L2 (Chain ID: 181228) - Arbitrum-based testnet
    ↓
Watson L3 (Chain ID: 987654322) ✅ FULLY OPERATIONAL
```

---

## What We Achieved

✅ **Custom 60-second force-include delay** (verified on-chain)
✅ **Manual RollupCreator deployment** (bypassed SDK limitations)
✅ **Full L3 sequencer running** with delayed message processing
✅ **End-to-end transaction flow** working (deposit → L3 tx → confirmation)
✅ **12+ L3 blocks created** and processing transactions
✅ **Deposits functional** (0.02 ETH deposited and available)

**Transaction Evidence**:
- Block 11: `0x8b5e9369f9915a2740681d358367e6fd4bebee2d759024be841f029158c8ac8f`
- Block 12: `0x920943944c6bf02c8261546eee7d16c97d19130f477947ea5124c231493a99bb`
- Balance on L3: 0.020088 ETH

---

## Prerequisites

### Software Requirements

```bash
# Node.js & TypeScript
node >= 18.x
npm >= 9.x
tsx (npm install -g tsx)

# Docker (for sequencer)
docker >= 20.x

# Development tools
git
viem (npm package)
dotenv (npm package)
```

### Environment Setup

Create a `.env` file in your project root:

```bash
# Private key for deployment (must have funds on parent L2)
DEPLOYER_PRIVATE_KEY=0x...

# Parent L2 RPC URL
PARENT_RPC_URL=https://sepolia.hpp.io  # or your L2 RPC

# Parent L2 Chain ID
PARENT_CHAIN_ID=181228  # HPP Sepolia
```

### Funding Requirements

- **Parent L2 native token**: ~0.5 ETH equivalent (for gas fees)
- **Stake token**: 0.1 tokens (for validator staking)

---

## Step-by-Step Deployment

### Phase 1: Deploy L3 Contracts (30 minutes)

**Run the deployment script**:

```bash
cd ~/watson
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/deploy-l3-fast-delay.ts
```

**What this does**:
1. Deploys a new stake token (ERC20)
2. Calls `RollupCreator.createRollup()` with custom parameters:
   - `delaySeconds: 60` (60 seconds, not 24 hours!)
   - `delayBlocks: 12` (12 L2 blocks)
   - `futureSeconds: 3600`
   - `futureBlocks: 12`
3. Deploys 32+ Arbitrum Orbit contracts (Rollup, Inbox, Bridge, SequencerInbox, etc.)
4. Saves deployment addresses to `deployment.json`

**Expected output**:
```
✅ Deployed 32 contracts
✅ Rollup: 0x...
✅ Inbox: 0x...
✅ Bridge: 0x...
✅ SequencerInbox: 0x...
⚡ Custom delay configuration: 60 seconds
```

**Verification**:
Check that `sequencerInboxMaxTimeVariation.delaySeconds = 60` by reading the SequencerInbox contract.

---

### Phase 2: Stake Validator (5 minutes)

**Run the staking script**:

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/stake-validator-v2.ts
```

**What this does**:
1. Approves the stake token for the Rollup contract
2. Calls `Rollup.newStake()` with 0.1 tokens
3. Registers your address as a validator

**Expected output**:
```
✅ Approved 0.1 WST
✅ Staked!
Block: 1874
```

---

### Phase 3: Launch Sequencer (Critical!)

**Prepare the launch script**:

The sequencer launch script (`launch-sequencer-v2.sh`) includes **two critical configuration flags** that are essential for delayed message processing:

```bash
--node.delayed-sequencer.use-merge-finality=false
--node.delayed-sequencer.finalize-distance=1
```

**Without these flags, the InboxTracker will NOT scan for delayed messages!**

**Launch the sequencer**:

```bash
chmod +x projects/arbitrum_to_arbitrum_l3_creation/scripts/launch-sequencer-v2.sh
./projects/arbitrum_to_arbitrum_l3_creation/scripts/launch-sequencer-v2.sh
```

**What this does**:
1. Stops any existing sequencer containers
2. Creates data directory (`~/watson/nitro-data-v2/`)
3. Launches Nitro node v3.2.1-d81324d with proper configuration
4. Initializes InboxTracker for delayed message monitoring

**Expected output**:
```
✅ Watson L3 v2 sequencer is running!
Container: watson-l3-v2-sequencer
HTTP RPC: http://localhost:8547
WebSocket: ws://localhost:8548
```

**Verify sequencer logs**:

```bash
docker logs -f watson-l3-v2-sequencer
```

You should see:
```
INFO InboxTracker SequencerBatchCount=0
INFO InboxTracker sequencerBatchCount=1 messageCount=1 l1Block=1873
```

---

### Phase 4: Make a Deposit (5 minutes)

**Run the deposit script**:

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/deposit-to-l3-v2.ts
```

**What this does**:
1. Calls `Inbox.depositEth()` with 0.01 ETH
2. Creates a delayed message on L2
3. Waits for transaction confirmation

**Expected output**:
```
✅ Deposited!
Block: 1879
⚡ With 60-second delay, this should be force-included in ~1 minute!
```

---

### Phase 5: Trigger L2 Block Production (Important for HPP Sepolia)

**If using HPP Sepolia** (or another L2 that requires transactions to produce blocks):

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/spam-l2-blocks.ts
```

**What this does**:
1. Creates 15 self-transfer transactions on L2
2. Each transaction produces a new L2 block
3. Advances L2 time/blocks past the force-include threshold

**Why this is needed**:
- HPP Sepolia only produces blocks when there are transactions
- Force-include requires EITHER 60 seconds elapsed OR 12 blocks produced
- This script ensures both conditions are met

**Expected output**:
```
Tx 1: Block 1880
Tx 2: Block 1881
...
Tx 15: Block 1894
Blocks created: 15
```

---

### Phase 6: Watch for Delayed Message Processing (Automatic)

The sequencer will automatically detect and process delayed messages once the threshold is met.

**Monitor sequencer logs**:

```bash
docker logs -f watson-l3-v2-sequencer | grep -i "delayed\|ExecutionEngine"
```

**What to look for**:

```
INFO ExecutionEngine: Added DelayedMessages pos=1 delayed=1 block-header=...
INFO ExecutionEngine: Added DelayedMessages pos=2 delayed=2 block-header=...
...
INFO ExecutionEngine: Added DelayedMessages pos=10 delayed=10 block-header=...
INFO DelayedSequencer: Sequenced msgnum=10 startpos=1
```

**This means**:
- ✅ Delayed messages detected
- ✅ L3 blocks being created (1, 2, 3, ... 10)
- ✅ Deposits being processed
- ✅ L3 is now operational!

---

### Phase 7: Test L3 Transactions

**Run the test script**:

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/test-l3-tx.ts
```

**Expected output**:

```
✅ L3 Sequencer is responsive!
Chain ID: 987654322
Block Number: 10
Balance: 0.020092 ETH

We have balance! Let me send a test transaction...
Transaction sent: 0x8b5e...
✅ Transaction confirmed!
Block: 11
Gas used: 60927

🎉🎉🎉 L3 IS WORKING! Transactions are being sequenced!
```

---

## Critical Discoveries

### Discovery 1: SDK Limitation

**Problem**: `@arbitrum/orbit-sdk` hardcodes `sequencerInboxMaxTimeVariation` with no customization:

```typescript
// SDK code (hardcoded!)
const config = {
  sequencerInboxMaxTimeVariation: {
    delayBlocks: BigInt(7200),      // ~24 hours
    futureBlocks: BigInt(7200),
    delaySeconds: BigInt(86400),    // 24 hours
    futureSeconds: BigInt(86400),
  }
}
```

**Solution**: Bypass SDK and call `RollupCreator` directly:

```typescript
// Our custom deployment
const maxTimeVariation = {
  delayBlocks: BigInt(12),      // 12 blocks
  futureBlocks: BigInt(12),
  delaySeconds: BigInt(60),     // 60 seconds!
  futureSeconds: BigInt(3600),
}

const tx = await rollupCreator.createRollup({
  config: {
    ...otherParams,
    sequencerInboxMaxTimeVariation: maxTimeVariation,
  }
});
```

### Discovery 2: Critical Sequencer Flags

**Problem**: Even with correct deployment, sequencer wasn't processing delayed messages.

**Root cause**: Missing delayed sequencer configuration flags.

**Solution**: Add these flags to sequencer launch:

```bash
--node.delayed-sequencer.use-merge-finality=false
--node.delayed-sequencer.finalize-distance=1
```

**Why these matter**:
- `use-merge-finality=false`: Don't wait for Ethereum merge finality (appropriate for testnet)
- `finalize-distance=1`: Consider messages final after 1 block confirmation

**Without these flags**: InboxTracker initializes but never scans for new delayed messages beyond its starting position.

### Discovery 3: L2 Block Production

**Problem**: On HPP Sepolia (and similar L2s), blocks only produce when there are transactions.

**Impact**: Force-include delay requires EITHER time elapsed OR blocks produced. If L2 stops producing blocks, time passes but block count doesn't increase.

**Solution**: Manually create transactions to trigger L2 block production (`spam-l2-blocks.ts`).

---

## Troubleshooting

### Sequencer Not Processing Delayed Messages

**Symptoms**:
- Sequencer running and responsive
- InboxTracker initialized
- L3 block number stuck at 0
- No "ExecutionEngine: Added DelayedMessages" logs

**Diagnosis**:

```bash
# Check if delayed sequencer flags are present
docker inspect watson-l3-v2-sequencer | grep delayed-sequencer

# Check InboxTracker logs
docker logs watson-l3-v2-sequencer | grep InboxTracker
```

**Solutions**:

1. **Verify delayed sequencer flags**:
   - Ensure `--node.delayed-sequencer.use-merge-finality=false` is present
   - Ensure `--node.delayed-sequencer.finalize-distance=1` is present

2. **Restart sequencer with clean state**:
   ```bash
   docker stop watson-l3-v2-sequencer
   docker rm watson-l3-v2-sequencer
   rm -rf ~/watson/nitro-data-v2
   ./launch-sequencer-v2.sh
   ```

3. **Create more L2 blocks**:
   ```bash
   npx tsx scripts/spam-l2-blocks.ts
   ```

### No Balance on L3

**Symptoms**:
- L3 responsive
- Block number > 0
- Balance = 0 ETH

**Possible causes**:

1. **Delayed messages not yet processed**:
   - Check if InboxTracker has processed your deposit
   - Look for "ExecutionEngine: Added DelayedMessages" in logs

2. **Insufficient time/blocks passed**:
   - Ensure 60 seconds have elapsed since deposit
   - OR ensure 12 L2 blocks have been produced since deposit

3. **L2 not producing blocks**:
   - Run `spam-l2-blocks.ts` to force L2 block creation

### Transaction Reverts on L3

**Symptoms**:
- Transaction sent but reverts
- Proper balance exists

**Common causes**:

1. **Gas estimation issues**: Use explicit gas limit
2. **Nonce issues**: Check nonce management
3. **Contract not deployed**: Verify contract address

---

## Files Reference

### Scripts

| File | Purpose |
|------|---------|
| `deploy-l3-fast-delay.ts` | Deploy L3 contracts with custom 60s delay |
| `stake-validator-v2.ts` | Stake validator on the Rollup |
| `deposit-to-l3-v2.ts` | Make ETH deposit from L2 to L3 |
| `test-l3-tx.ts` | Test L3 transaction execution |
| `spam-l2-blocks.ts` | Generate L2 blocks to meet force-include threshold |
| `launch-sequencer-v2.sh` | Launch Nitro sequencer with proper config |

### Configuration

| File | Purpose |
|------|---------|
| `example-deployment.json` | Example of deployed contract addresses |

### Documentation

| File | Purpose |
|------|---------|
| `SUCCESS_SUMMARY.md` | Detailed narrative of successful deployment |
| `README.md` | This guide |

---

## Key Configuration Values

### Deployment Parameters

```typescript
// Chain configuration
chainId: 987654322                    // L3 chain ID (choose your own)
parentChainId: 181228                 // HPP Sepolia (or your L2)

// Force-include delay (THE KEY CUSTOMIZATION!)
sequencerInboxMaxTimeVariation: {
  delaySeconds: BigInt(60),           // 60 seconds (not 24 hours!)
  delayBlocks: BigInt(12),            // 12 L2 blocks
  futureSeconds: BigInt(3600),        // 1 hour future message buffer
  futureBlocks: BigInt(12),           // 12 blocks future buffer
}

// Stake requirements
baseStake: parseEther("0.1")          // 0.1 stake tokens required
```

### Sequencer Configuration

```bash
# Critical flags for delayed message processing
--node.delayed-sequencer.enable=true
--node.delayed-sequencer.use-merge-finality=false
--node.delayed-sequencer.finalize-distance=1

# Chain configuration
--chain.id=987654322
--parent-chain.connection.url=https://sepolia.hpp.io

# Batch posting
--node.batch-poster.enable=true
--node.batch-poster.max-delay=1s
```

---

## Expected Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Deploy L3 contracts | 30 min | 30 min |
| Stake validator | 5 min | 35 min |
| Launch sequencer | 5 min | 40 min |
| Make deposit | 5 min | 45 min |
| Generate L2 blocks | 5 min | 50 min |
| Wait for processing | 2 min | 52 min |
| Test transactions | 2 min | 54 min |
| **Total** | **~1 hour** | |

---

## Success Criteria

✅ Deployment script completes without errors
✅ Sequencer logs show "InboxTracker" initialization
✅ Custom delay verified: `delaySeconds = 60`
✅ Validator staked: 0.1 tokens
✅ Deposit transaction confirmed on L2
✅ Sequencer logs show "ExecutionEngine: Added DelayedMessages"
✅ L3 block number increases (1, 2, 3, ...)
✅ Balance appears on L3 (0.01+ ETH)
✅ Test transaction confirms on L3

---

## Additional Resources

- [Arbitrum Orbit Documentation](https://docs.arbitrum.io/launch-orbit-chain/orbit-gentle-introduction)
- [Arbitrum Nitro GitHub](https://github.com/OffchainLabs/nitro)
- [Force-Include Documentation](https://docs.arbitrum.io/how-arbitrum-works/sequencer)

---

## Support

For issues or questions:
1. Check the [Troubleshooting](#troubleshooting) section
2. Review sequencer logs: `docker logs watson-l3-v2-sequencer`
3. Verify configuration against this guide
4. Review `SUCCESS_SUMMARY.md` for detailed deployment narrative

---

**Last Updated**: November 5, 2025
**Version**: 1.0
**Status**: Production-ready ✅
