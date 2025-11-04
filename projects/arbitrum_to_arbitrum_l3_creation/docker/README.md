# L3 Automaker - Automated Arbitrum L3 Deployment

Fully automated L3 deployment via Docker Compose. From zero to verified L3 in ~35-40 minutes.

## What It Does

1. ✅ Checks for RollupCreator factory on parent chain
2. ✅ Deploys L3 with custom force-include delay (60 seconds by default)
3. ✅ Stakes validator
4. ✅ Starts Nitro sequencer with proper delayed message processing
5. ✅ Makes initial deposit
6. ✅ Waits for force-include threshold
7. ✅ Verifies L3 with test transaction

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Private key with funds on parent L2 (for deployment + gas)
- Parent L2 must be Arbitrum-based

### Setup

1. Copy environment template:
```bash
cd docker
cp .env.example .env
```

2. Edit `.env` with your configuration:
```bash
# Required
PARENT_RPC_URL=https://sepolia.hpp.io
PARENT_CHAIN_ID=181228
DEPLOYER_PRIVATE_KEY=0xyour_private_key_here

# Optional (defaults shown)
L3_CHAIN_ID=987654322
L3_CHAIN_NAME=Watson L3
FORCE_INCLUDE_DELAY_SECONDS=60
FORCE_INCLUDE_DELAY_BLOCKS=12
STAKE_AMOUNT=0.1
INITIAL_DEPOSIT_AMOUNT=0.01
```

**Need help choosing a Chain ID?** Use the Chain ID Wizard:
```bash
cd orchestrator
node scripts/chain-id-wizard.js
# Or for quick generation: node scripts/chain-id-wizard.js --random
```
See [Chain ID Guide](docs/CHAIN_ID_GUIDE.md) for more info.

3. Run:
```bash
docker-compose up
```

That's it! The orchestration handles everything automatically.

## What Happens

### Stage 1: Deployer (~30 minutes)
- Checks for RollupCreator factory
- Deploys stake token (WST)
- Deploys L3 contracts (rollup, inbox, bridge, sequencer inbox, etc.)
- Stakes validator
- Saves deployment info to `deployment.json`

### Stage 2: Sequencer Init (~5 seconds)
- Waits for `deployment.json`
- Generates `chain-info.json` for Nitro sequencer
- Prepares sequencer configuration

### Stage 3: Sequencer (continuous)
- Starts Arbitrum Nitro node
- Connects to parent chain
- Processes delayed messages with critical flags:
  - `--node.delayed-sequencer.use-merge-finality=false`
  - `--node.delayed-sequencer.finalize-distance=1`
- Exposes HTTP RPC on port 8547
- Exposes WebSocket RPC on port 8548

### Stage 4: Bootstrapper (~2-3 minutes)
- Makes initial ETH deposit to L3
- Waits for force-include threshold (60s + 12 blocks)
- Generates L2 blocks if needed (for testnets like HPP Sepolia)
- Verifies delayed message processing
- Sends test transaction on L3
- Saves results to `bootstrap-result.json`

## Monitoring

### Watch logs:
```bash
docker-compose logs -f
```

### Check specific service:
```bash
docker-compose logs -f deployer
docker-compose logs -f sequencer
docker-compose logs -f bootstrapper
```

### View deployment info:
```bash
docker exec l3-automaker-deployer cat /data/deployment.json
```

### View bootstrap results:
```bash
docker exec l3-automaker-bootstrapper cat /data/bootstrap-result.json
```

## Output Files

The Docker volume `deployment-data` contains:

- `deployment.json` - L3 contract addresses and configuration
- `chain-info.json` - Sequencer configuration
- `bootstrap-result.json` - Verification results and timing

To extract:
```bash
docker cp l3-automaker-deployer:/data/deployment.json .
docker cp l3-automaker-bootstrapper:/data/bootstrap-result.json .
```

## Accessing Your L3

Once bootstrap is complete:

- **HTTP RPC**: `http://localhost:8547`
- **WebSocket RPC**: `ws://localhost:8548`

Test with curl:
```bash
curl -X POST http://localhost:8547 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

Or with cast:
```bash
cast chain-id --rpc-url http://localhost:8547
cast block-number --rpc-url http://localhost:8547
cast balance YOUR_ADDRESS --rpc-url http://localhost:8547
```

## Cleanup

Stop and remove containers:
```bash
docker-compose down
```

Remove volumes (deletes deployment data):
```bash
docker-compose down -v
```

## Troubleshooting

### Deployment fails with "No RollupCreator factory found"

Set `ROLLUP_CREATOR_ADDRESS` in `.env` to the factory address on your parent L2.

### Sequencer won't start

Check that `deployment.json` and `chain-info.json` were created:
```bash
docker-compose logs sequencer-init
```

### Delayed messages not processing

Verify sequencer has the critical flags:
```bash
docker-compose logs sequencer | grep delayed-sequencer
```

Should see:
```
--node.delayed-sequencer.use-merge-finality=false
--node.delayed-sequencer.finalize-distance=1
```

### Bootstrap hangs waiting for blocks

If parent L2 doesn't produce blocks automatically (like HPP Sepolia), the bootstrapper will create transactions to generate blocks. This is normal.

### Balance still 0 after force-include wait

Check sequencer logs for delayed message processing:
```bash
docker-compose logs sequencer | grep -i "delayed\|inbox"
```

Should see messages about InboxTracker and delayed message processing.

## Architecture

```
┌─────────────────┐
│   deployer      │  Deploys L3 contracts + stakes validator
└────────┬────────┘
         │
         ├── creates: deployment.json
         │
         v
┌─────────────────┐
│ sequencer-init  │  Generates chain-info.json
└────────┬────────┘
         │
         v
┌─────────────────┐
│   sequencer     │  Nitro node (runs continuously)
└────────┬────────┘
         │
         │ (waits for healthy)
         │
         v
┌─────────────────┐
│  bootstrapper   │  Deposit + force-include + verify
└─────────────────┘
```

## Performance

### Timing (based on HPP Sepolia testnet):

- **Deployment**: ~30 minutes (RollupCreator.createRollup + staking)
- **Sequencer startup**: ~30 seconds
- **Bootstrap**: ~2-3 minutes (deposit + force-include + verification)
- **Total**: ~35-40 minutes from zero to verified L3

### Resource Usage:

- **Memory**: ~2GB for sequencer, ~500MB for orchestrator containers
- **Disk**: ~1GB for sequencer data
- **CPU**: Low (mostly waiting for L2 transactions)

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PARENT_RPC_URL` | (required) | Parent L2 RPC endpoint |
| `PARENT_CHAIN_ID` | (required) | Parent L2 chain ID |
| `DEPLOYER_PRIVATE_KEY` | (required) | Private key for deployment & sequencer |
| `L3_CHAIN_ID` | 987654322 | Your L3 chain ID |
| `L3_CHAIN_NAME` | Watson L3 | Your L3 name |
| `FORCE_INCLUDE_DELAY_SECONDS` | 60 | Force-include time threshold |
| `FORCE_INCLUDE_DELAY_BLOCKS` | 12 | Force-include block threshold |
| `SEQUENCER_HTTP_PORT` | 8547 | Sequencer HTTP RPC port |
| `SEQUENCER_WS_PORT` | 8548 | Sequencer WebSocket port |
| `STAKE_AMOUNT` | 0.1 | Validator stake amount (in stake tokens) |
| `INITIAL_DEPOSIT_AMOUNT` | 0.01 | Initial deposit for testing (in ETH) |
| `ROLLUP_CREATOR_ADDRESS` | (auto) | RollupCreator factory address |

## Advanced Usage

### Custom Force-Include Delay

For faster testing:
```bash
FORCE_INCLUDE_DELAY_SECONDS=30
FORCE_INCLUDE_DELAY_BLOCKS=6
```

For production (more secure):
```bash
FORCE_INCLUDE_DELAY_SECONDS=86400  # 24 hours
FORCE_INCLUDE_DELAY_BLOCKS=7200    # ~1 day of blocks
```

### Running Individual Stages

Deploy only:
```bash
docker-compose up deployer
```

Start sequencer only (after deployment):
```bash
docker-compose up sequencer
```

Bootstrap only (after sequencer is healthy):
```bash
docker-compose up bootstrapper
```

### Persistent Sequencer

To keep sequencer running after bootstrap completes:
```bash
docker-compose up -d sequencer
```

Then bootstrap:
```bash
docker-compose up bootstrapper
```

Sequencer will continue running in background.

## Known Issues

1. **HPP Sepolia block production**: Requires transactions to produce blocks. Bootstrapper handles this automatically.

2. **Deployment time**: The RollupCreator.createRollup() call can take 20-30 minutes. This is normal for L3 deployment.

3. **Sequencer startup**: First startup may take longer as it syncs with parent chain.

## Development

### Building locally

```bash
cd orchestrator
docker build -t l3-automaker-orchestrator .
```

### Testing scripts

```bash
cd orchestrator
npm install
node scripts/deploy.js
```

## Support

For issues:
1. Check logs: `docker-compose logs`
2. Verify configuration: `.env` file
3. Check parent L2 RPC accessibility
4. Ensure sufficient funds for gas

## Credits

Built on:
- Arbitrum Orbit (Offchain Labs)
- Arbitrum Nitro v3.2.1-d81324d
- Viem (Ethereum library)
- Docker & Docker Compose

---

**Status**: Production-ready ✅
**Last Updated**: November 2025
**Tested On**: HPP Sepolia (Arbitrum L2 testnet)
