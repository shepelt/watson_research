#!/usr/bin/env node

import { createPublicClient, createWalletClient, http, parseEther, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { writeFileSync } from 'fs';
import { config } from 'dotenv';

config();

const DEPLOYMENT_FILE = '/data/deployment.json';
const START_TIME = Date.now();

function log(message) {
  const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${message}`);
}

async function main() {
  log('=== L3 Deployment Script ===');

  const parentRpcUrl = process.env.PARENT_RPC_URL;
  const parentChainId = parseInt(process.env.PARENT_CHAIN_ID);
  const l3ChainId = BigInt(process.env.L3_CHAIN_ID || 987654322);
  const l3ChainName = process.env.L3_CHAIN_NAME || 'Watson L3';
  const forceIncludeDelaySeconds = BigInt(process.env.FORCE_INCLUDE_DELAY_SECONDS || 60);
  const forceIncludeDelayBlocks = BigInt(process.env.FORCE_INCLUDE_DELAY_BLOCKS || 12);
  const stakeAmount = process.env.STAKE_AMOUNT || '0.1';

  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: { id: parentChainId },
    transport: http(parentRpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: { id: parentChainId },
    transport: http(parentRpcUrl)
  });

  log(`Deployer: ${account.address}`);
  log(`Parent Chain ID: ${parentChainId}`);
  log(`L3 Chain ID: ${l3ChainId}`);

  // Check for factory
  log('Checking for RollupCreator factory...');
  const knownFactories = [
    '0x0A1da8a4Df1C3d1591B4A9E34Ed508dE5c537977', // HPP Sepolia
    process.env.ROLLUP_CREATOR_ADDRESS
  ].filter(Boolean);

  let rollupCreatorAddress;
  for (const address of knownFactories) {
    try {
      const code = await publicClient.getBytecode({ address });
      if (code && code !== '0x') {
        log(`✅ Found RollupCreator at ${address}`);
        rollupCreatorAddress = address;
        break;
      }
    } catch (e) {
      // Continue
    }
  }

  if (!rollupCreatorAddress) {
    throw new Error('No RollupCreator factory found - please set ROLLUP_CREATOR_ADDRESS');
  }

  // Deploy stake token
  log('Deploying stake token...');
  const stakeTokenBytecode = '0x' + [
    '608060405234801561001057600080fd5b506040518060400160405280601381526020017f57617473',
    '6f6e205374616b6520546f6b656e000000000000000000008152506040518060400160405280',
    '600381526020017f57535400000000000000000000000000000000000000000000000000000000',
    '008152508160039081610090919061029c565b50806004908161009f919061029c565b505050610',
    '0b73361000000000000000000000000000000000000000006b033b2e3c9fd0803ce80000',
    '0061012860201b60201c565b61036e565b600073ffffffffffffffffffffffffffffffff',
    'ff168273ffffffffffffffffffffffffffffffffffffffff160361019a576040517f08c379a000',
    '000000000000000000000000000000000000000000000000000000815260040161019190610',
    '3f5565b60405180910390fd5b6101ac60008383610269565b80600260008282546101be91',
    '90610444565b92505081905550806000808473ffffffffffffffffffffffffffffffffffffffff16',
    '73ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082',
    '825461021d9190610444565b925050819055508173ffffffffffffffffffffffffffffffffffffff',
    'ff16600073ffffffffffffffffffffffffffffffffffffffff167fddf252ad1be2c89b69c2b068',
    'fc378daa952ba7f163c4a11628f55a4df523b3ef8360405161027d9190610487565b604051',
    '80910390a35050565b505050565b600081519050919050565b7f4e487b71000000000000000000',
    '00000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b71',
    '00000000000000000000000000000000000000000000000000000000600052602260045260',
    '246000fd5b600060028204905060018216806102fa57607f821691505b60208210810361030d',
    '5761030c6102b3565b5b50919050565b60008190508160005260206000209050919050565b6000',
    '6020601f8301049050919050565b600082821b905092915050565b6000600883026103577fffffffff',
    'ffffffffffffffffffffffffffffffffffffffffffffffffffff82610338565b610361868361',
    '0338565b95508019841693508086168417925050509392505050565b6000819050919050565b60',
    '00819050919050565b60006103ae6103a96103a484610379565b610383565b610379565b90509190',
    '50565b600060408201905081810360008301526103cb818561031390919063ffffffff16565b9050',
    '81810360208301526103e38185610313565b9050949350505050565b610411816103ee565b82525050',
    '565b6000602082019050610426600083018461040d565b92915050565b7f4e487b710000000000',
    '0000000000000000000000000000000000000000000000600052601160045260246000fd5b6000',
    '61044f82610379565b915061045a83610379565b92508282019050808211156104725761047161042c',
    '565b5b92915050565b61048181610379565b82525050565b600060208201905061049c600083',
    '0184610478565b92915050565b610c59806104b16000396000f3fe'
  ].join('');

  const stakeTokenHash = await walletClient.sendTransaction({
    data: stakeTokenBytecode,
    gas: 2000000n
  });

  log(`Stake token tx: ${stakeTokenHash}`);
  const stakeTokenReceipt = await publicClient.waitForTransactionReceipt({ hash: stakeTokenHash });
  const stakeTokenAddress = stakeTokenReceipt.contractAddress;
  log(`✅ Stake token deployed: ${stakeTokenAddress}`);

  // Deploy L3
  log('Preparing L3 deployment...');

  const chainConfig = {
    chainId: Number(l3ChainId),
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
      AllowDebugPrecompiles: false,
      DataAvailabilityCommittee: false,
      InitialArbOSVersion: 11,
      GenesisBlockNum: 0,
      MaxCodeSize: 24576,
      MaxInitCodeSize: 49152,
      InitialChainOwner: account.address
    }
  };

  const deployConfig = {
    confirmPeriodBlocks: 20n,
    extraChallengeTimeBlocks: 10n,
    stakeToken: stakeTokenAddress,
    baseStake: parseEther(stakeAmount),
    wasmModuleRoot: '0x184884e1eb9fefdc158f6c8ac912bb183bf3cf83f0090317e0bc4ac5860baa39',
    owner: account.address,
    loserStakeEscrow: '0x0000000000000000000000000000000000000000',
    chainId: l3ChainId,
    chainConfig: JSON.stringify(chainConfig),
    genesisBlockNum: 0n,
    sequencerInboxMaxTimeVariation: {
      delayBlocks: forceIncludeDelayBlocks,
      futureBlocks: 12n,
      delaySeconds: forceIncludeDelaySeconds,
      futureSeconds: 3600n
    }
  };

  log(`Force-include: ${forceIncludeDelaySeconds}s / ${forceIncludeDelayBlocks} blocks`);

  const rollupCreatorAbi = parseAbi([
    'function createRollup((uint64 confirmPeriodBlocks, uint64 extraChallengeTimeBlocks, address stakeToken, uint256 baseStake, bytes32 wasmModuleRoot, address owner, address loserStakeEscrow, uint256 chainId, string chainConfig, uint64 genesisBlockNum, (uint256 delayBlocks, uint256 futureBlocks, uint256 delaySeconds, uint256 futureSeconds) sequencerInboxMaxTimeVariation) config, address batchPoster, address[] validators, uint256 maxDataSize, address nativeToken, bool deployFactoriesToL2, uint256 maxFeePerGasForRetryables, address[] addOrOrbitAdmins) external returns (address)'
  ]);

  log('Calling RollupCreator.createRollup()...');
  const deployHash = await walletClient.writeContract({
    address: rollupCreatorAddress,
    abi: rollupCreatorAbi,
    functionName: 'createRollup',
    args: [
      deployConfig,
      account.address,
      [account.address],
      117964n,
      '0x0000000000000000000000000000000000000000',
      true,
      parseEther('0.1'),
      []
    ],
    gas: 30000000n
  });

  log(`Deployment tx: ${deployHash}`);
  log('Waiting for confirmation (this takes ~30 minutes)...');

  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  log(`✅ L3 deployed in block ${deployReceipt.blockNumber}`);

  // Extract rollup address
  const rollupCreatedTopic = '0x84c162f1396badc29f9c932c79d7495db699b615e2c0da163ae26bd5dbe71d7c';
  const rollupCreatedLog = deployReceipt.logs.find(log => log.topics[0] === rollupCreatedTopic);
  if (!rollupCreatedLog) {
    throw new Error('Could not find RollupCreated event');
  }

  const rollupAddress = '0x' + rollupCreatedLog.topics[1].slice(26);
  log(`Rollup: ${rollupAddress}`);

  // Get contract addresses
  const rollupAbi = parseAbi([
    'function inbox() view returns (address)',
    'function bridge() view returns (address)',
    'function sequencerInbox() view returns (address)'
  ]);

  const [inboxAddress, bridgeAddress, sequencerInboxAddress] = await Promise.all([
    publicClient.readContract({ address: rollupAddress, abi: rollupAbi, functionName: 'inbox' }),
    publicClient.readContract({ address: rollupAddress, abi: rollupAbi, functionName: 'bridge' }),
    publicClient.readContract({ address: rollupAddress, abi: rollupAbi, functionName: 'sequencerInbox' })
  ]);

  log(`Inbox: ${inboxAddress}`);
  log(`Bridge: ${bridgeAddress}`);
  log(`SequencerInbox: ${sequencerInboxAddress}`);

  // Stake validator
  log('Staking validator...');

  const erc20Abi = parseAbi(['function approve(address spender, uint256 amount) returns (bool)']);
  const rollupStakeAbi = parseAbi(['function newStake(uint256 tokenAmount, address withdrawalAddress) external']);

  const stakeAmountWei = parseEther(stakeAmount);

  const approveHash = await walletClient.writeContract({
    address: stakeTokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [rollupAddress, stakeAmountWei]
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  log('✅ Approved');

  const stakeHash = await walletClient.writeContract({
    address: rollupAddress,
    abi: rollupStakeAbi,
    functionName: 'newStake',
    args: [stakeAmountWei, account.address],
    gas: 500000n
  });
  await publicClient.waitForTransactionReceipt({ hash: stakeHash });
  log('✅ Validator staked');

  // Save deployment info
  const deployment = {
    chainId: Number(l3ChainId),
    chainName: l3ChainName,
    parentChainId,
    parentRpcUrl,
    forceIncludeDelay: {
      seconds: Number(forceIncludeDelaySeconds),
      blocks: Number(forceIncludeDelayBlocks)
    },
    contracts: {
      rollup: rollupAddress,
      inbox: inboxAddress,
      bridge: bridgeAddress,
      sequencerInbox: sequencerInboxAddress,
      stakeToken: stakeTokenAddress,
      rollupCreator: rollupCreatorAddress
    },
    deployer: account.address,
    deployedAt: new Date().toISOString(),
    deploymentBlock: Number(deployReceipt.blockNumber)
  };

  writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
  log('✅ Saved deployment.json');

  const totalTime = ((Date.now() - START_TIME) / 1000 / 60).toFixed(1);
  log(`🎉 Deployment complete in ${totalTime} minutes`);
}

main().catch(error => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
