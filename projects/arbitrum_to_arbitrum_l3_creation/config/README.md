# Configuration Files

## Required Files

### .env
Create this file in your project root (not in config directory):

```bash
cp config/.env.example ../.env
# Then edit ../.env with your actual values
```

**Required variables**:
- `DEPLOYER_PRIVATE_KEY` - Your private key with funds on parent L2
- `PARENT_RPC_URL` - Parent L2 RPC endpoint
- `PARENT_CHAIN_ID` - Parent L2 chain ID

## Example Files

### example-deployment.json
Example output from `deploy-l3-fast-delay.ts` script.

Shows the structure of deployed contract addresses:
- Rollup
- Inbox
- Outbox
- Bridge
- SequencerInbox
- ChallengeManager
- RollupEventInbox
- UpgradeExecutor
- ValidatorWalletCreator

**Your deployment will create**: `deployment.json` in project root

### example-factory-deployment.json
Example of Orbit factory contracts deployed on parent L2.

Contains addresses for:
- RollupCreator (main factory)
- BridgeCreator
- ChallengeManagerTemplates
- And other factory contracts

**Use this to find** the RollupCreator address for your parent L2.

### package.json
Template `package.json` with required dependencies.

**To use**:
```bash
cp config/package.json ../package.json
cd ..
npm install
```

**Dependencies**:
- `viem` - Ethereum library
- `dotenv` - Environment variables
- `tsx` - TypeScript execution
- `typescript` - TypeScript compiler

## Configuration Notes

### Chain IDs
- **HPP Sepolia** (example parent L2): 181228
- **Watson L3** (example deployment): 987654322
- Choose your own L3 chain ID (must be unique)

### RollupCreator Addresses
Different parent L2s may have RollupCreator at different addresses.

**Common addresses**:
- HPP Sepolia: `0x0A1da8a4Df1C3d1591B4A9E34Ed508dE5c537977`
- Other L2s: Check Arbitrum documentation or explorer

### Force-Include Delay
Configured in `deploy-l3-fast-delay.ts`:
- `delaySeconds: 60` (60 seconds, not 24 hours!)
- `delayBlocks: 12` (12 L2 blocks)

**Modify** these values in the deployment script if needed.

### Sequencer Configuration
Configured in `launch-sequencer-v2.sh`:
- HTTP RPC: Port 8547
- WebSocket: Port 8548
- Data directory: `~/watson/nitro-data-v2/`

**Critical flags**:
```bash
--node.delayed-sequencer.use-merge-finality=false
--node.delayed-sequencer.finalize-distance=1
```

## Security Notes

### Private Keys
- ⚠️ **NEVER commit `.env` files to git**
- ⚠️ **NEVER share private keys**
- Use test wallets for testnet deployments
- Use hardware wallets for production

### RPC URLs
- Use reliable RPC providers
- Consider rate limits
- Use dedicated endpoints for production

### Funding
**Required funds on parent L2**:
- Deployment: ~0.3-0.5 ETH equivalent (gas fees)
- Stake token: 0.1 tokens (for validator)
- Deposits: Amount you want to deposit + gas
- Testing: Small amounts for test transactions

**Minimum recommended**: 1 ETH equivalent on parent L2

## File Checklist

Before deployment, ensure you have:
- [ ] `.env` file created and configured
- [ ] `package.json` copied and dependencies installed
- [ ] Sufficient funds on parent L2
- [ ] Parent L2 RPC accessible
- [ ] Docker installed (for sequencer)

---

**See README.md for complete deployment guide**
