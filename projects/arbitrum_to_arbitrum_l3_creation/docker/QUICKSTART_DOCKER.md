# L3 Automaker - Quick Start

## TL;DR

```bash
cd ~/watson/projects/arbitrum_to_arbitrum_l3_creation/docker
docker-compose up
# Wait ~40 minutes
# Access L3 at http://localhost:8547
```

## What Happens

1. **Deployer** → Deploys L3 contracts (~30 min)
2. **Sequencer-Init** → Configures sequencer (~5 sec)
3. **Sequencer** → Starts Nitro node (~30 sec)
4. **Bootstrapper** → Deposits, waits, verifies (~2-3 min)

## Commands

### Deploy
```bash
docker-compose up
```

### Monitor
```bash
# All logs
docker-compose logs -f

# Specific service
docker-compose logs -f deployer
docker-compose logs -f sequencer
docker-compose logs -f bootstrapper
```

### Check Results
```bash
# Deployment info
docker exec l3-automaker-deployer cat /data/deployment.json | jq

# Bootstrap results
docker exec l3-automaker-bootstrapper cat /data/bootstrap-result.json | jq

# Test L3
cast chain-id --rpc-url http://localhost:8547
cast block-number --rpc-url http://localhost:8547
```

### Cleanup
```bash
# Stop and remove containers
docker-compose down

# Also remove volumes (deletes data)
docker-compose down -v
```

## Configuration

Edit `.env` file:
```bash
# Required
PARENT_RPC_URL=https://sepolia.hpp.io
PARENT_CHAIN_ID=181228
DEPLOYER_PRIVATE_KEY=0x...

# Optional (defaults work fine)
L3_CHAIN_ID=987654323
FORCE_INCLUDE_DELAY_SECONDS=60
FORCE_INCLUDE_DELAY_BLOCKS=12
```

## Output

### Success Looks Like
```
[1830.5s] 🎉🎉🎉 L3 IS FULLY OPERATIONAL! 🎉🎉🎉
[1830.5s]
[1830.5s] Summary:
[1830.5s]   Chain ID: 987654323
[1830.5s]   Rollup: 0x...
[1830.5s]   Sequencer RPC: http://localhost:8547
[1830.5s]
[1830.5s] Verification:
[1830.5s]   Balance: 0.020088 ETH
[1830.5s]   Block number: 12
[1830.5s]   Test tx: 0x...
```

### Files Created
- `/data/deployment.json` - Contract addresses
- `/data/bootstrap-result.json` - Verification results
- `/data/chain-info.json` - Sequencer config

## Troubleshooting

### "No RollupCreator factory found"
Set `ROLLUP_CREATOR_ADDRESS` in `.env`

### Sequencer won't start
Check logs: `docker-compose logs sequencer`

### Balance still 0 after bootstrap
Check delayed message processing:
```bash
docker-compose logs sequencer | grep -i delayed
```

## More Help

- `README.md` - Full documentation
- `BUILD_SUMMARY.md` - Technical details
- `COMPLETION_REPORT.md` - What was built

## Expected Timeline

| Stage | Time |
|-------|------|
| Deployment | 30 min |
| Sequencer | 30 sec |
| Bootstrap | 2-3 min |
| **Total** | **~35 min** |

## Requirements

- Docker & Docker Compose
- Funds on parent L2 (for gas)
- ~3 GB disk space
- ~2 GB memory

---

**One command. Zero intervention. Verified L3.**
