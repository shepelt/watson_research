import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  Address,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const hppSepolia = {
  id: 181228,
  name: 'HPP Sepolia',
  network: 'hpp-sepolia',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['https://sepolia.hpp.io'] },
    public: { http: ['https://sepolia.hpp.io'] },
  },
  testnet: true,
};

// Load existing deployment for RollupCreator and StakeToken
const existingDeployment = JSON.parse(
  fs.readFileSync('./watson-l3-deployment.json', 'utf-8')
);

const ROLLUP_CREATOR_ADDRESS = '0x0A1da8a4Df1C3d1591B4A9E34Ed508dE5c537977' as Address;
const STAKE_TOKEN_ADDRESS = existingDeployment.stakeToken as Address;

// NEW Chain ID to avoid conflicts
const NEW_CHAIN_ID = 987654322;

async function deployL3WithFastDelay() {
  console.log('=== Deploying Watson L3 v2 with 60-Second Force-Include Delay ===\n');

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: hppSepolia,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: hppSepolia,
    transport: http(),
  });

  console.log('Deployer:', account.address);

  const balance = await publicClient.getBalance({ address: account.address });
  console.log('Balance:', (Number(balance) / 1e18).toFixed(4), 'ETH\n');

  console.log('RollupCreator:', ROLLUP_CREATOR_ADDRESS);
  console.log('StakeToken:', STAKE_TOKEN_ADDRESS);
  console.log('New Chain ID:', NEW_CHAIN_ID);
  console.log('');

  // Chain config for new L3
  const chainConfig = {
    chainId: NEW_CHAIN_ID,
    homesteadBlock: 0,
    daoForkBlock: null,
    daoForkSupport: true,
    eip150Block: 0,
    eip150Hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    eip155Block: 0,
    eip158Block: 0,
    byzantiumBlock: 0,
    constantinopleBlock: 0,
    petersburgBlock: 0,
    istanbulBlock: 0,
    muirGlacierBlock: 0,
    berlinBlock: 0,
    londonBlock: 0,
    clique: { period: 0, epoch: 0 },
    arbitrum: {
      EnableArbOS: true,
      AllowDebugPrecompiles: true,
      DataAvailabilityCommittee: false,
      InitialArbOSVersion: 32,
      InitialChainOwner: account.address,
      GenesisBlockNum: 0,
    },
  };

  // WASM Module Root (use standard one)
  const wasmModuleRoot = '0x184884e1eb9fefdc158f6c8ac912bb183bf3cf83f0090317e0bc4ac5860baa39';

  // Config struct with CUSTOM maxTimeVariation
  const config = {
    confirmPeriodBlocks: 1n,
    stakeToken: STAKE_TOKEN_ADDRESS,
    baseStake: parseEther('0.1'), // 0.1 WST base stake
    wasmModuleRoot: wasmModuleRoot as `0x${string}`,
    owner: account.address,
    loserStakeEscrow: account.address,
    chainId: BigInt(NEW_CHAIN_ID),
    chainConfig: JSON.stringify(chainConfig),
    minimumAssertionPeriod: 1n,
    validatorAfkBlocks: 201600n,
    genesisAssertionState: {
      globalState: {
        bytes32Vals: [
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
          '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
        ],
        u64Vals: [0n, 0n],
      },
      machineStatus: 1, // FINISHED
      endHistoryRoot: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    },
    genesisInboxCount: 0n,
    miniStakeValues: [parseEther('0.04'), parseEther('0.02'), parseEther('0.01')],
    layerZeroBlockEdgeHeight: 2n ** 26n,
    layerZeroBigStepEdgeHeight: 2n ** 19n,
    layerZeroSmallStepEdgeHeight: 2n ** 23n,
    numBigStepLevel: 1n,
    challengeGracePeriodBlocks: 10n,
    bufferConfig: { threshold: 600n, max: 14400n, replenishRateInBasis: 500n },
    // HERE'S THE KEY CHANGE: 60 seconds instead of 86400!
    sequencerInboxMaxTimeVariation: {
      delayBlocks: 12n, // ~2 minutes at 10s per block
      futureBlocks: 12n,
      delaySeconds: 60n, // 60 SECONDS!
      futureSeconds: 3600n,
    },
    anyTrustFastConfirmer: '0x0000000000000000000000000000000000000000' as Address,
  };

  // RollupDeploymentParams struct
  const deployParams = {
    config: config,
    validators: [account.address], // Add ourselves as validator
    maxDataSize: 104857n, // Must match SequencerInbox template maxDataSize
    nativeToken: '0x0000000000000000000000000000000000000000' as Address, // ETH-based
    deployFactoriesToL2: true,
    maxFeePerGasForRetryables: parseEther('0.000000001'), // 1 gwei
    batchPosters: [account.address], // Add ourselves as batch poster
    batchPosterManager: account.address,
    feeTokenPricer: '0x0000000000000000000000000000000000000000' as Address, // Not needed for ETH
  };

  console.log('Config prepared with 60-second delay:');
  console.log('  - delaySeconds:', config.sequencerInboxMaxTimeVariation.delaySeconds.toString());
  console.log('  - delayBlocks:', config.sequencerInboxMaxTimeVariation.delayBlocks.toString());
  console.log('');

  // Read RollupCreator ABI
  const rollupCreatorABI = JSON.parse(
    fs.readFileSync('./nitro-contracts/build/contracts/src/rollup/RollupCreator.sol/RollupCreator.json', 'utf-8')
  ).abi;

  console.log('Calling createRollup...');
  console.log('This will deploy a new set of L3 contracts with fast delay settings.');
  console.log('');

  try {
    const hash = await walletClient.writeContract({
      address: ROLLUP_CREATOR_ADDRESS,
      abi: rollupCreatorABI,
      functionName: 'createRollup',
      args: [deployParams],
      value: parseEther('0.13'), // 0.13 ETH for deploying L2 factories
    });

    console.log('Transaction sent:', hash);
    console.log('Waiting for confirmation...');

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    console.log('✅ Deployment complete!');
    console.log('Block:', receipt.blockNumber.toString());
    console.log('');

    // Parse RollupCreated event
    const rollupCreatedEvent = receipt.logs.find((log) => {
      try {
        const decoded = publicClient.decodeEventLog({
          abi: rollupCreatorABI,
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === 'RollupCreated';
      } catch {
        return false;
      }
    });

    if (rollupCreatedEvent) {
      const decoded = publicClient.decodeEventLog({
        abi: rollupCreatorABI,
        data: rollupCreatedEvent.data,
        topics: rollupCreatedEvent.topics,
      }) as any;

      const newDeployment = {
        chainId: NEW_CHAIN_ID,
        deployer: account.address,
        stakeToken: STAKE_TOKEN_ADDRESS,
        contracts: {
          rollup: decoded.args.rollupAddress,
          inbox: decoded.args.inboxAddress,
          outbox: decoded.args.outbox,
          bridge: decoded.args.bridge,
          sequencerInbox: decoded.args.sequencerInbox,
          challengeManager: decoded.args.challengeManager,
          rollupEventInbox: decoded.args.rollupEventInbox,
          upgradeExecutor: decoded.args.upgradeExecutor,
          validatorWalletCreator: decoded.args.validatorWalletCreator,
        },
        deployedAt: Number(receipt.blockNumber),
      };

      fs.writeFileSync(
        './watson-l3-v2-deployment.json',
        JSON.stringify(newDeployment, null, 2)
      );

      console.log('📝 Deployment saved to watson-l3-v2-deployment.json');
      console.log('');
      console.log('Contract Addresses:');
      console.log('  - Rollup:', decoded.args.rollupAddress);
      console.log('  - Inbox:', decoded.args.inboxAddress);
      console.log('  - Bridge:', decoded.args.bridge);
      console.log('  - SequencerInbox:', decoded.args.sequencerInbox);
      console.log('  - UpgradeExecutor:', decoded.args.upgradeExecutor);
      console.log('');
      console.log('✅ Ready for sequencer setup with 60-second force-include delay!');
    } else {
      console.log('⚠️  RollupCreated event not found in receipt');
    }
  } catch (error: any) {
    console.error('❌ Deployment failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
    throw error;
  }
}

deployL3WithFastDelay()
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
