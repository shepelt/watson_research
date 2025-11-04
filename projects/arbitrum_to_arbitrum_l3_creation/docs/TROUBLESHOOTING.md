# Troubleshooting Guide

**Common issues and solutions for L3 deployment**

---

## Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [Sequencer Issues](#sequencer-issues)
3. [Delayed Message Issues](#delayed-message-issues)
4. [Transaction Issues](#transaction-issues)
5. [Diagnostic Commands](#diagnostic-commands)

---

## Deployment Issues

### Issue: Deployment script fails with "insufficient funds"

**Symptoms**:
```
Error: insufficient funds for gas * price + value
```

**Diagnosis**:
```bash
# Check balance on parent L2
npx tsx -e "
import { createPublicClient, http } from 'viem';
const client = createPublicClient({
  chain: { id: 181228, rpcUrls: { default: { http: ['https://sepolia.hpp.io'] } } },
  transport: http()
});
const balance = await client.getBalance({ address: '0xYourAddress' });
console.log('Balance:', Number(balance) / 1e18, 'ETH');
"
```

**Solution**:
- Fund your address on the parent L2
- Minimum recommended: 0.5 ETH equivalent

---

### Issue: Deployment fails with "RollupCreator not found"

**Symptoms**:
```
Error: Contract not found at address
```

**Diagnosis**:
- RollupCreator not deployed on parent L2
- Wrong parent chain RPC URL

**Solution**:
1. Verify parent chain RPC URL in `.env`
2. Check if parent chain is an Arbitrum-based L2
3. Deploy Orbit factory contracts first (if not already deployed)

---

### Issue: Custom delay not being applied

**Symptoms**:
- Deployment succeeds
- Reading SequencerInbox shows `delaySeconds = 86400` (24 hours)

**Diagnosis**:
```bash
npx tsx -e "
import { createPublicClient, http } from 'viem';
const deployment = JSON.parse(fs.readFileSync('./deployment.json', 'utf-8'));
const client = createPublicClient({
  chain: { id: 181228, rpcUrls: { default: { http: ['https://sepolia.hpp.io'] } } },
  transport: http()
});
const maxTimeVariation = await client.readContract({
  address: deployment.sequencerInbox,
  abi: [{
    inputs: [],
    name: 'maxTimeVariation',
    outputs: [/* ... */],
    stateMutability: 'view',
    type: 'function'
  }],
  functionName: 'maxTimeVariation'
});
console.log('Delay seconds:', maxTimeVariation.delaySeconds.toString());
"
```

**Solution**:
- Verify you're using `deploy-l3-fast-delay.ts` (not SDK deployment)
- Check the `sequencerInboxMaxTimeVariation` parameters in deployment script
- Redeploy if necessary

---

## Sequencer Issues

### Issue: Sequencer container won't start

**Symptoms**:
```
docker: Error response from daemon: ...
```

**Diagnosis**:
```bash
# Check if port is already in use
lsof -i :8547

# Check Docker daemon
docker ps
```

**Solutions**:

1. **Port conflict**:
   ```bash
   # Kill existing process on port 8547
   kill -9 $(lsof -ti:8547)

   # Or change port in launch script
   -p 8548:8547  # Use different external port
   ```

2. **Docker daemon not running**:
   ```bash
   # Start Docker Desktop (Mac)
   open /Applications/Docker.app

   # Or start Docker service (Linux)
   sudo systemctl start docker
   ```

3. **Existing container**:
   ```bash
   docker stop watson-l3-v2-sequencer
   docker rm watson-l3-v2-sequencer
   ./launch-sequencer-v2.sh
   ```

---

### Issue: Sequencer starts but immediately exits

**Symptoms**:
```
docker ps  # Container not listed
docker ps -a  # Shows Exited status
```

**Diagnosis**:
```bash
docker logs watson-l3-v2-sequencer
```

**Common causes**:

1. **Invalid chain.info-json**:
   - Check JSON syntax in launch script
   - Verify contract addresses are correct

2. **Database corruption**:
   ```bash
   rm -rf ~/watson/nitro-data-v2
   ./launch-sequencer-v2.sh
   ```

3. **Parent chain connection issues**:
   - Verify `--parent-chain.connection.url` is accessible
   - Test: `curl https://sepolia.hpp.io`

---

### Issue: Sequencer running but RPC not responding

**Symptoms**:
```bash
curl http://localhost:8547
# Connection refused
```

**Diagnosis**:
```bash
docker ps | grep watson-l3-v2-sequencer
docker logs watson-l3-v2-sequencer | grep "HTTP server"
```

**Solutions**:

1. **Sequencer still initializing**:
   - Wait 30 seconds for initialization
   - Check logs for "HTTP server started"

2. **Port mapping issue**:
   ```bash
   docker port watson-l3-v2-sequencer
   # Should show: 8547/tcp -> 0.0.0.0:8547
   ```

3. **Firewall blocking**:
   ```bash
   # Test from host
   curl http://localhost:8547 -X POST -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}'
   ```

---

## Delayed Message Issues

### Issue: InboxTracker not initializing

**Symptoms**:
- Sequencer running
- No "InboxTracker" logs

**Diagnosis**:
```bash
docker logs watson-l3-v2-sequencer 2>&1 | grep -i "inbox"
```

**Solutions**:

1. **Missing delayed sequencer flags**:
   - Verify `--node.delayed-sequencer.enable=true` in launch script
   - Verify `--node.delayed-sequencer.use-merge-finality=false`
   - Verify `--node.delayed-sequencer.finalize-distance=1`

2. **Clean restart**:
   ```bash
   docker stop watson-l3-v2-sequencer
   docker rm watson-l3-v2-sequencer
   rm -rf ~/watson/nitro-data-v2
   ./launch-sequencer-v2.sh
   ```

---

### Issue: InboxTracker initialized but not progressing

**Symptoms**:
```
INFO InboxTracker l1Block=1873
# ... no further InboxTracker logs
```

**Diagnosis**:
```bash
# Check if InboxTracker is stuck
docker logs watson-l3-v2-sequencer | grep "InboxTracker" | tail -5

# Check Data poster progress
docker logs watson-l3-v2-sequencer | grep "Data poster" | tail -5
```

**Root cause**: InboxTracker loaded cached state and isn't scanning forward.

**Solutions**:

1. **Restart with clean state** (most reliable):
   ```bash
   docker stop watson-l3-v2-sequencer
   docker rm watson-l3-v2-sequencer
   rm -rf ~/watson/nitro-data-v2
   ./launch-sequencer-v2.sh
   ```

2. **Generate more L2 blocks**:
   ```bash
   npx tsx scripts/spam-l2-blocks.ts
   ```

3. **Verify delayed sequencer configuration**:
   ```bash
   docker inspect watson-l3-v2-sequencer | grep delayed-sequencer
   ```

---

### Issue: Delayed messages not being processed

**Symptoms**:
- InboxTracker initialized and progressing
- No "ExecutionEngine: Added DelayedMessages" logs
- L3 block number = 0

**Diagnosis**:
```bash
# Check delayed message count on Bridge
npx tsx -e "
import { createPublicClient, http } from 'viem';
const deployment = JSON.parse(fs.readFileSync('./deployment.json', 'utf-8'));
const client = createPublicClient({
  chain: { id: 181228, rpcUrls: { default: { http: ['https://sepolia.hpp.io'] } } },
  transport: http()
});
const count = await client.readContract({
  address: deployment.bridge,
  abi: [{
    inputs: [],
    name: 'delayedMessageCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }],
  functionName: 'delayedMessageCount'
});
console.log('Delayed messages:', count.toString());
"
```

**Solutions**:

1. **Insufficient time/blocks elapsed**:
   ```bash
   # Check time since deposit
   # Requirement: 60 seconds OR 12 blocks (whichever comes first)

   # Generate more L2 blocks
   npx tsx scripts/spam-l2-blocks.ts
   ```

2. **Make a new deposit**:
   ```bash
   npx tsx scripts/deposit-to-l3-v2.ts
   # Wait 60 seconds
   # Generate L2 blocks
   npx tsx scripts/spam-l2-blocks.ts
   ```

3. **Verify force-include threshold**:
   ```bash
   # Read maxTimeVariation from SequencerInbox
   # Ensure delaySeconds = 60, delayBlocks = 12
   ```

---

## Transaction Issues

### Issue: Transaction reverts on L3

**Symptoms**:
```
Error: transaction reverted
```

**Diagnosis**:
```bash
# Check balance
npx tsx scripts/test-l3-tx.ts

# Check nonce
npx tsx -e "
const client = createPublicClient({
  chain: { id: 987654322, rpcUrls: { default: { http: ['http://localhost:8547'] } } },
  transport: http()
});
const nonce = await client.getTransactionCount({ address: '0xYourAddress' });
console.log('Nonce:', nonce);
"
```

**Solutions**:

1. **Insufficient balance**:
   - Make another deposit
   - Wait for delayed message processing

2. **Nonce mismatch**:
   - Use correct nonce in transaction
   - Or let viem handle nonce automatically

3. **Gas estimation failure**:
   ```typescript
   // Use explicit gas limit
   await walletClient.sendTransaction({
     to: address,
     value: parseEther('0.0001'),
     gas: 100000n,  // Explicit gas limit
   });
   ```

---

### Issue: Transaction pending forever

**Symptoms**:
- Transaction sent
- Never gets mined
- `waitForTransactionReceipt` times out

**Diagnosis**:
```bash
# Check if sequencer is creating blocks
curl -s http://localhost:8547 -X POST \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq

# Wait 10 seconds and check again
sleep 10
curl -s http://localhost:8547 -X POST \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq
```

**Solutions**:

1. **Sequencer not creating blocks**:
   - Check sequencer logs for errors
   - Restart sequencer

2. **Transaction not reaching sequencer**:
   - Verify RPC URL: `http://localhost:8547`
   - Check if sequencer RPC is accessible

---

## Diagnostic Commands

### Check Sequencer Health

```bash
# Container status
docker ps | grep watson-l3-v2-sequencer

# Recent logs
docker logs watson-l3-v2-sequencer | tail -50

# InboxTracker status
docker logs watson-l3-v2-sequencer | grep "InboxTracker" | tail -5

# Delayed message processing
docker logs watson-l3-v2-sequencer | grep -i "delayed\|ExecutionEngine"

# Data poster status
docker logs watson-l3-v2-sequencer | grep "Data poster" | tail -5
```

### Check L3 Status

```bash
# Chain ID
curl -s http://localhost:8547 -X POST \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' | jq

# Block number
curl -s http://localhost:8547 -X POST \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq

# Balance
curl -s http://localhost:8547 -X POST \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xYourAddress","latest"],"id":1}' | jq
```

### Check L2 Status

```bash
# Block number
curl -s https://sepolia.hpp.io -X POST \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq

# Delayed message count
npx tsx -e "
import { createPublicClient, http } from 'viem';
const deployment = JSON.parse(fs.readFileSync('./deployment.json', 'utf-8'));
const client = createPublicClient({
  chain: { id: 181228, rpcUrls: { default: { http: ['https://sepolia.hpp.io'] } } },
  transport: http()
});
const count = await client.readContract({
  address: deployment.bridge,
  abi: [{ inputs: [], name: 'delayedMessageCount', outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view', type: 'function' }],
  functionName: 'delayedMessageCount'
});
console.log('Delayed messages:', count.toString());
"
```

### Check Force-Include Configuration

```bash
npx tsx -e "
import { createPublicClient, http } from 'viem';
import * as fs from 'fs';

const deployment = JSON.parse(fs.readFileSync('./deployment.json', 'utf-8'));
const client = createPublicClient({
  chain: { id: 181228, rpcUrls: { default: { http: ['https://sepolia.hpp.io'] } } },
  transport: http()
});

const maxTimeVariation = await client.readContract({
  address: deployment.sequencerInbox,
  abi: [{
    inputs: [],
    name: 'maxTimeVariation',
    outputs: [
      { name: 'delayBlocks', type: 'uint256' },
      { name: 'futureBlocks', type: 'uint256' },
      { name: 'delaySeconds', type: 'uint256' },
      { name: 'futureSeconds', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function'
  }],
  functionName: 'maxTimeVariation'
});

console.log('Max Time Variation:');
console.log('  delayBlocks:', maxTimeVariation[0].toString());
console.log('  futureBlocks:', maxTimeVariation[1].toString());
console.log('  delaySeconds:', maxTimeVariation[2].toString());
console.log('  futureSeconds:', maxTimeVariation[3].toString());
console.log('');
console.log('Expected for fast delay:');
console.log('  delaySeconds: 60 (got', maxTimeVariation[2].toString(), ')');
console.log('  delayBlocks: 12 (got', maxTimeVariation[0].toString(), ')');
"
```

---

## Emergency Procedures

### Complete Reset

If all else fails, perform a complete reset:

```bash
# 1. Stop and remove sequencer
docker stop watson-l3-v2-sequencer
docker rm watson-l3-v2-sequencer

# 2. Clear all data
rm -rf ~/watson/nitro-data-v2

# 3. Restart sequencer
./launch-sequencer-v2.sh

# 4. Make a new deposit
npx tsx scripts/deposit-to-l3-v2.ts

# 5. Generate L2 blocks
npx tsx scripts/spam-l2-blocks.ts

# 6. Wait 60 seconds
sleep 60

# 7. Check status
docker logs watson-l3-v2-sequencer | grep "ExecutionEngine"
npx tsx scripts/test-l3-tx.ts
```

### Verify Critical Configuration

```bash
# 1. Check delayed sequencer flags
docker inspect watson-l3-v2-sequencer | grep -A 3 "delayed-sequencer"

# Should see:
# --node.delayed-sequencer.enable=true
# --node.delayed-sequencer.use-merge-finality=false
# --node.delayed-sequencer.finalize-distance=1

# 2. Check force-include delay
# (See "Check Force-Include Configuration" above)
# Should show delaySeconds = 60

# 3. Check InboxTracker initialization
docker logs watson-l3-v2-sequencer | grep "InboxTracker" | head -5

# Should see:
# INFO InboxTracker SequencerBatchCount=0
# INFO InboxTracker sequencerBatchCount=1 messageCount=1 l1Block=...
```

---

## Getting Help

If issues persist:

1. ✅ Review this troubleshooting guide
2. ✅ Check sequencer logs thoroughly
3. ✅ Verify all configuration parameters
4. ✅ Try complete reset procedure
5. ✅ Review README.md for step-by-step instructions
6. ✅ Check SUCCESS_SUMMARY.md for detailed deployment narrative

---

**Last Updated**: November 5, 2025
