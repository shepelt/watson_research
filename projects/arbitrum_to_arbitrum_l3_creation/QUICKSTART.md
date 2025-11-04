# Quick Start - Deploy L3 in 10 Steps

**For experienced developers who want to deploy fast**

---

## Prerequisites Checklist

- [ ] Node.js 18+ installed
- [ ] Docker installed and running
- [ ] Private key with funds on parent L2
- [ ] Parent L2 RPC URL
- [ ] `.env` file configured

---

## 10-Step Deployment

### 1. Setup Environment

```bash
cd ~/watson
cat > .env << EOF
DEPLOYER_PRIVATE_KEY=0xyour_private_key_here
PARENT_RPC_URL=https://sepolia.hpp.io
PARENT_CHAIN_ID=181228
EOF
```

### 2. Install Dependencies

```bash
npm install viem dotenv
npm install -g tsx
```

### 3. Deploy L3 Contracts

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/deploy-l3-fast-delay.ts
```

**Expected**: Creates `deployment.json` with contract addresses

### 4. Verify Delay Configuration

```typescript
// Should show delaySeconds: 60
const sequencerInbox = await client.readContract({
  address: deployment.sequencerInbox,
  abi: sequencerInboxABI,
  functionName: 'maxTimeVariation'
});
```

### 5. Stake Validator

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/stake-validator-v2.ts
```

**Expected**: Transaction confirmed, validator registered

### 6. Launch Sequencer

```bash
chmod +x projects/arbitrum_to_arbitrum_l3_creation/scripts/launch-sequencer-v2.sh
./projects/arbitrum_to_arbitrum_l3_creation/scripts/launch-sequencer-v2.sh
```

**Expected**: Container running, port 8547 accessible

### 7. Verify Sequencer

```bash
docker logs watson-l3-v2-sequencer | grep "InboxTracker"
```

**Expected**: See "InboxTracker" logs with initialization

### 8. Make Deposit

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/deposit-to-l3-v2.ts
```

**Expected**: Deposit transaction confirmed on L2

### 9. Generate L2 Blocks

```bash
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/spam-l2-blocks.ts
```

**Expected**: 15 new L2 blocks created

### 10. Test L3

```bash
# Wait 30 seconds for processing
sleep 30

# Test L3 transaction
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/test-l3-tx.ts
```

**Expected**: Balance > 0, transaction confirmed on L3

---

## Success Indicators

✅ **Deployment**: `deployment.json` created with 32+ contract addresses
✅ **Delay Config**: `delaySeconds = 60` (not 86400)
✅ **Sequencer**: Container running, logs show InboxTracker
✅ **Delayed Messages**: Logs show "ExecutionEngine: Added DelayedMessages"
✅ **L3 Blocks**: Block number > 0
✅ **Balance**: ETH balance > 0 on L3
✅ **Transactions**: Test tx confirmed in new L3 block

---

## Common Issues

### Issue: Sequencer not processing delayed messages

**Fix**:
```bash
docker stop watson-l3-v2-sequencer
rm -rf ~/watson/nitro-data-v2
./projects/arbitrum_to_arbitrum_l3_creation/scripts/launch-sequencer-v2.sh
```

### Issue: No balance on L3

**Fix**:
```bash
# Create more L2 blocks
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/spam-l2-blocks.ts

# Wait 60 seconds
sleep 60

# Check again
npx tsx projects/arbitrum_to_arbitrum_l3_creation/scripts/test-l3-tx.ts
```

### Issue: Transaction reverts

**Check**:
1. Sufficient balance?
2. Correct chain ID (987654322)?
3. Sequencer running?

---

## Verification Commands

```bash
# Check L3 block number
curl -s http://localhost:8547 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq

# Check sequencer logs
docker logs watson-l3-v2-sequencer | tail -50

# Check L2 block number
curl -s $PARENT_RPC_URL -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq
```

---

## Timeline

- Steps 1-3: 30 minutes (deployment)
- Steps 4-7: 10 minutes (setup)
- Steps 8-10: 10 minutes (testing)
- **Total: ~50 minutes**

---

**Read the full README.md for detailed explanations and troubleshooting**
