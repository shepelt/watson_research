#!/usr/bin/env node

import { createPublicClient, createWalletClient, http, parseEther, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

const DEPLOYMENT_FILE = '/data/deployment.json';
const STATE_FILE = '/data/orchestrator-state.json';

// Orchestrator state
const STAGES = {
  CHECK_FACTORY: 'check_factory',
  DEPLOY_FACTORY: 'deploy_factory',
  DEPLOY_L3: 'deploy_l3',
  STAKE_VALIDATOR: 'stake_validator',
  WAIT_FOR_SEQUENCER: 'wait_for_sequencer',
  MAKE_DEPOSIT: 'make_deposit',
  WAIT_FOR_FORCE_INCLUDE: 'wait_for_force_include',
  VERIFY: 'verify',
  COMPLETE: 'complete'
};

class L3Orchestrator {
  constructor() {
    this.parentRpcUrl = process.env.PARENT_RPC_URL;
    this.parentChainId = parseInt(process.env.PARENT_CHAIN_ID);
    this.l3ChainId = BigInt(process.env.L3_CHAIN_ID || 987654322);
    this.l3ChainName = process.env.L3_CHAIN_NAME || 'Watson L3';
    this.forceIncludeDelaySeconds = BigInt(process.env.FORCE_INCLUDE_DELAY_SECONDS || 60);
    this.forceIncludeDelayBlocks = BigInt(process.env.FORCE_INCLUDE_DELAY_BLOCKS || 12);
    this.stakeAmount = process.env.STAKE_AMOUNT || '0.1';
    this.initialDepositAmount = process.env.INITIAL_DEPOSIT_AMOUNT || '0.01';

    this.account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);

    this.publicClient = createPublicClient({
      chain: { id: this.parentChainId },
      transport: http(this.parentRpcUrl)
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: { id: this.parentChainId },
      transport: http(this.parentRpcUrl)
    });

    this.state = this.loadState();
  }

  loadState() {
    if (existsSync(STATE_FILE)) {
      const data = readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
    return { stage: STAGES.CHECK_FACTORY, data: {} };
  }

  saveState() {
    writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  async waitForTx(hash, message) {
    this.log(`${message} - tx: ${hash}`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    this.log(`✅ Confirmed in block ${receipt.blockNumber}`);
    return receipt;
  }

  async checkFactoryExists() {
    this.log('=== STAGE 1: Checking for RollupCreator factory ===');

    // Known factory addresses
    const knownFactories = [
      '0x0A1da8a4Df1C3d1591B4A9E34Ed508dE5c537977', // HPP Sepolia
      process.env.ROLLUP_CREATOR_ADDRESS
    ].filter(Boolean);

    for (const address of knownFactories) {
      try {
        const code = await this.publicClient.getBytecode({ address });
        if (code && code !== '0x') {
          this.log(`✅ Found RollupCreator at ${address}`);
          this.state.data.rollupCreatorAddress = address;
          this.saveState();
          return address;
        }
      } catch (e) {
        // Continue checking
      }
    }

    this.log('❌ No RollupCreator factory found');
    return null;
  }

  async deployL3() {
    this.log('=== STAGE 2: Deploying L3 with custom force-include delay ===');

    const rollupCreatorAddress = this.state.data.rollupCreatorAddress;
    if (!rollupCreatorAddress) {
      throw new Error('RollupCreator address not found in state');
    }

    // Deploy stake token first
    this.log('Deploying stake token...');

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

    const stakeTokenHash = await this.walletClient.sendTransaction({
      data: stakeTokenBytecode,
      gasLimit: 2000000n
    });

    const stakeTokenReceipt = await this.waitForTx(stakeTokenHash, 'Deploying stake token');
    const stakeTokenAddress = stakeTokenReceipt.contractAddress;
    this.log(`Stake token deployed at: ${stakeTokenAddress}`);

    // Prepare RollupCreator.createRollup() call
    this.log('Preparing L3 deployment parameters...');

    const chainConfig = {
      chainId: Number(this.l3ChainId),
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
      clique: {
        period: 0,
        epoch: 0
      },
      arbitrum: {
        EnableArbOS: true,
        AllowDebugPrecompiles: false,
        DataAvailabilityCommittee: false,
        InitialArbOSVersion: 11,
        GenesisBlockNum: 0,
        MaxCodeSize: 24576,
        MaxInitCodeSize: 49152,
        InitialChainOwner: this.account.address
      }
    };

    const config = {
      confirmPeriodBlocks: 20n,
      extraChallengeTimeBlocks: 10n,
      stakeToken: stakeTokenAddress,
      baseStake: parseEther(this.stakeAmount),
      wasmModuleRoot: '0x184884e1eb9fefdc158f6c8ac912bb183bf3cf83f0090317e0bc4ac5860baa39',
      owner: this.account.address,
      loserStakeEscrow: '0x0000000000000000000000000000000000000000',
      chainId: this.l3ChainId,
      chainConfig: JSON.stringify(chainConfig),
      genesisBlockNum: 0n,
      sequencerInboxMaxTimeVariation: {
        delayBlocks: this.forceIncludeDelayBlocks,
        futureBlocks: 12n,
        delaySeconds: this.forceIncludeDelaySeconds,
        futureSeconds: 3600n
      }
    };

    this.log(`Force-include delay: ${this.forceIncludeDelaySeconds}s / ${this.forceIncludeDelayBlocks} blocks`);

    const rollupCreatorAbi = parseAbi([
      'function createRollup((uint64 confirmPeriodBlocks, uint64 extraChallengeTimeBlocks, address stakeToken, uint256 baseStake, bytes32 wasmModuleRoot, address owner, address loserStakeEscrow, uint256 chainId, string chainConfig, uint64 genesisBlockNum, (uint256 delayBlocks, uint256 futureBlocks, uint256 delaySeconds, uint256 futureSeconds) sequencerInboxMaxTimeVariation) config, address batchPoster, address[] validators, uint256 maxDataSize, address nativeToken, bool deployFactoriesToL2, uint256 maxFeePerGasForRetryables, address[] addOrOrbitAdmins) external returns (address)'
    ]);

    this.log('Calling RollupCreator.createRollup()...');

    const deployHash = await this.walletClient.writeContract({
      address: rollupCreatorAddress,
      abi: rollupCreatorAbi,
      functionName: 'createRollup',
      args: [
        config,
        this.account.address, // batchPoster
        [this.account.address], // validators
        117964n, // maxDataSize
        '0x0000000000000000000000000000000000000000', // nativeToken (ETH)
        true, // deployFactoriesToL2
        parseEther('0.1'), // maxFeePerGasForRetryables
        [] // addOrOrbitAdmins
      ],
      gas: 30000000n
    });

    const deployReceipt = await this.waitForTx(deployHash, 'Deploying L3');

    // Parse logs to extract contract addresses
    this.log('Parsing deployment logs...');

    // The RollupCreated event contains the rollup address
    const rollupCreatedTopic = '0x84c162f1396badc29f9c932c79d7495db699b615e2c0da163ae26bd5dbe71d7c';
    const rollupCreatedLog = deployReceipt.logs.find(log => log.topics[0] === rollupCreatedTopic);

    if (!rollupCreatedLog) {
      throw new Error('Could not find RollupCreated event');
    }

    const rollupAddress = '0x' + rollupCreatedLog.topics[1].slice(26);
    this.log(`Rollup deployed at: ${rollupAddress}`);

    // Get additional contract addresses from the rollup
    const rollupAbi = parseAbi([
      'function inbox() view returns (address)',
      'function bridge() view returns (address)',
      'function sequencerInbox() view returns (address)',
      'function stakeToken() view returns (address)'
    ]);

    const [inboxAddress, bridgeAddress, sequencerInboxAddress] = await Promise.all([
      this.publicClient.readContract({ address: rollupAddress, abi: rollupAbi, functionName: 'inbox' }),
      this.publicClient.readContract({ address: rollupAddress, abi: rollupAbi, functionName: 'bridge' }),
      this.publicClient.readContract({ address: rollupAddress, abi: rollupAbi, functionName: 'sequencerInbox' })
    ]);

    const deployment = {
      chainId: Number(this.l3ChainId),
      chainName: this.l3ChainName,
      parentChainId: this.parentChainId,
      parentRpcUrl: this.parentRpcUrl,
      forceIncludeDelay: {
        seconds: Number(this.forceIncludeDelaySeconds),
        blocks: Number(this.forceIncludeDelayBlocks)
      },
      contracts: {
        rollup: rollupAddress,
        inbox: inboxAddress,
        bridge: bridgeAddress,
        sequencerInbox: sequencerInboxAddress,
        stakeToken: stakeTokenAddress,
        rollupCreator: rollupCreatorAddress
      },
      deployer: this.account.address,
      deployedAt: new Date().toISOString(),
      deploymentBlock: Number(deployReceipt.blockNumber)
    };

    writeFileSync(DEPLOYMENT_FILE, JSON.stringify(deployment, null, 2));
    this.log('✅ Deployment info saved to deployment.json');

    this.state.data.deployment = deployment;
    this.saveState();

    return deployment;
  }

  async stakeValidator() {
    this.log('=== STAGE 3: Staking validator ===');

    const { deployment } = this.state.data;
    const { rollup, stakeToken } = deployment.contracts;

    const erc20Abi = parseAbi([
      'function approve(address spender, uint256 amount) returns (bool)'
    ]);

    const rollupAbi = parseAbi([
      'function newStake(uint256 tokenAmount, address withdrawalAddress) external'
    ]);

    const stakeAmountWei = parseEther(this.stakeAmount);

    // Approve
    this.log(`Approving ${this.stakeAmount} tokens for staking...`);
    const approveHash = await this.walletClient.writeContract({
      address: stakeToken,
      abi: erc20Abi,
      functionName: 'approve',
      args: [rollup, stakeAmountWei]
    });
    await this.waitForTx(approveHash, 'Approving stake tokens');

    // Stake
    this.log('Staking...');
    const stakeHash = await this.walletClient.writeContract({
      address: rollup,
      abi: rollupAbi,
      functionName: 'newStake',
      args: [stakeAmountWei, this.account.address],
      gas: 500000n
    });
    await this.waitForTx(stakeHash, 'Staking validator');

    this.log('✅ Validator staked successfully');
    this.state.data.validatorStaked = true;
    this.saveState();
  }

  async waitForSequencer() {
    this.log('=== STAGE 4: Waiting for sequencer to be ready ===');

    const sequencerRpcUrl = `http://sequencer:${process.env.SEQUENCER_HTTP_PORT || 8547}`;
    const maxRetries = 60;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await fetch(sequencerRpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
            id: 1
          })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            this.log(`✅ Sequencer is responsive! Chain ID: ${data.result}`);
            this.state.data.sequencerReady = true;
            this.saveState();
            return;
          }
        }
      } catch (e) {
        // Sequencer not ready yet
      }

      retries++;
      this.log(`Waiting for sequencer... (${retries}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    throw new Error('Sequencer did not become ready in time');
  }

  async makeDeposit() {
    this.log('=== STAGE 5: Making initial deposit ===');

    const { deployment } = this.state.data;
    const { inbox } = deployment.contracts;

    const inboxAbi = parseAbi([
      'function depositEth() payable returns (uint256)'
    ]);

    const depositAmount = parseEther(this.initialDepositAmount);

    this.log(`Depositing ${this.initialDepositAmount} ETH to L3...`);
    const depositHash = await this.walletClient.writeContract({
      address: inbox,
      abi: inboxAbi,
      functionName: 'depositEth',
      value: depositAmount,
      gas: 500000n
    });

    const depositReceipt = await this.waitForTx(depositHash, 'Depositing to L3');

    this.state.data.depositBlock = Number(depositReceipt.blockNumber);
    this.state.data.depositTime = Date.now();
    this.saveState();

    this.log(`✅ Deposit made at block ${depositReceipt.blockNumber}`);
  }

  async waitForForceInclude() {
    this.log('=== STAGE 6: Waiting for force-include threshold ===');

    const depositBlock = BigInt(this.state.data.depositBlock);
    const blocksNeeded = this.forceIncludeDelayBlocks;
    const secondsNeeded = Number(this.forceIncludeDelaySeconds);

    this.log(`Need ${blocksNeeded} blocks AND ${secondsNeeded} seconds to pass`);

    // Wait for time threshold
    const depositTime = this.state.data.depositTime;
    const timeToWait = secondsNeeded * 1000;
    const timeElapsed = Date.now() - depositTime;

    if (timeElapsed < timeToWait) {
      const remainingTime = timeToWait - timeElapsed;
      this.log(`Waiting ${Math.ceil(remainingTime / 1000)}s for time threshold...`);
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }
    this.log('✅ Time threshold met');

    // Wait for block threshold
    let currentBlock = await this.publicClient.getBlockNumber();
    while (currentBlock - depositBlock < blocksNeeded) {
      this.log(`Current block: ${currentBlock}, need ${depositBlock + blocksNeeded}`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      currentBlock = await this.publicClient.getBlockNumber();
    }
    this.log('✅ Block threshold met');

    // Give sequencer a moment to process
    this.log('Giving sequencer 10s to process delayed messages...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    this.state.data.forceIncludeReady = true;
    this.saveState();
  }

  async verify() {
    this.log('=== STAGE 7: Verification ===');

    const sequencerRpcUrl = `http://sequencer:${process.env.SEQUENCER_HTTP_PORT || 8547}`;

    const l3Client = createPublicClient({
      transport: http(sequencerRpcUrl)
    });

    const l3WalletClient = createWalletClient({
      account: this.account,
      transport: http(sequencerRpcUrl)
    });

    // Check balance
    this.log('Checking L3 balance...');
    const balance = await l3Client.getBalance({ address: this.account.address });
    this.log(`L3 Balance: ${Number(balance) / 1e18} ETH`);

    if (balance === 0n) {
      throw new Error('Balance is still 0 - delayed messages may not have been processed');
    }

    // Check chain ID
    const chainId = await l3Client.getChainId();
    this.log(`L3 Chain ID: ${chainId}`);

    if (chainId !== Number(this.l3ChainId)) {
      throw new Error(`Chain ID mismatch: expected ${this.l3ChainId}, got ${chainId}`);
    }

    // Send test transaction
    this.log('Sending test transaction on L3...');
    const testTxHash = await l3WalletClient.sendTransaction({
      to: this.account.address,
      value: parseEther('0.0001'),
      chain: { id: Number(this.l3ChainId) }
    });

    this.log(`Test transaction sent: ${testTxHash}`);
    const testReceipt = await l3Client.waitForTransactionReceipt({ hash: testTxHash });

    this.log(`✅ Test transaction confirmed in L3 block ${testReceipt.blockNumber}`);
    this.log(`Gas used: ${testReceipt.gasUsed}`);

    const blockNumber = await l3Client.getBlockNumber();
    this.log(`Current L3 block number: ${blockNumber}`);

    this.state.data.verified = true;
    this.state.data.verificationBlock = Number(blockNumber);
    this.saveState();

    return {
      balance: Number(balance) / 1e18,
      chainId,
      blockNumber: Number(blockNumber),
      testTransaction: {
        hash: testTxHash,
        blockNumber: Number(testReceipt.blockNumber),
        gasUsed: Number(testReceipt.gasUsed)
      }
    };
  }

  async run() {
    try {
      this.log('🚀 Starting L3 Automaker Orchestrator');
      this.log(`Parent Chain: ${this.parentChainId}`);
      this.log(`L3 Chain ID: ${this.l3ChainId}`);
      this.log(`Deployer: ${this.account.address}`);

      // Stage 1: Check factory
      if (this.state.stage === STAGES.CHECK_FACTORY) {
        const factoryAddress = await this.checkFactoryExists();
        if (!factoryAddress) {
          throw new Error('Factory deployment not implemented - please provide ROLLUP_CREATOR_ADDRESS');
        }
        this.state.stage = STAGES.DEPLOY_L3;
        this.saveState();
      }

      // Stage 2: Deploy L3
      if (this.state.stage === STAGES.DEPLOY_L3) {
        await this.deployL3();
        this.state.stage = STAGES.STAKE_VALIDATOR;
        this.saveState();
      }

      // Stage 3: Stake validator
      if (this.state.stage === STAGES.STAKE_VALIDATOR) {
        await this.stakeValidator();
        this.state.stage = STAGES.WAIT_FOR_SEQUENCER;
        this.saveState();
      }

      // Stage 4: Wait for sequencer
      if (this.state.stage === STAGES.WAIT_FOR_SEQUENCER) {
        await this.waitForSequencer();
        this.state.stage = STAGES.MAKE_DEPOSIT;
        this.saveState();
      }

      // Stage 5: Make deposit
      if (this.state.stage === STAGES.MAKE_DEPOSIT) {
        await this.makeDeposit();
        this.state.stage = STAGES.WAIT_FOR_FORCE_INCLUDE;
        this.saveState();
      }

      // Stage 6: Wait for force-include
      if (this.state.stage === STAGES.WAIT_FOR_FORCE_INCLUDE) {
        await this.waitForForceInclude();
        this.state.stage = STAGES.VERIFY;
        this.saveState();
      }

      // Stage 7: Verify
      if (this.state.stage === STAGES.VERIFY) {
        const verificationResult = await this.verify();
        this.state.stage = STAGES.COMPLETE;
        this.state.data.verificationResult = verificationResult;
        this.saveState();
      }

      if (this.state.stage === STAGES.COMPLETE) {
        this.log('');
        this.log('🎉🎉🎉 L3 DEPLOYMENT COMPLETE! 🎉🎉🎉');
        this.log('');
        this.log('Deployment summary:');
        this.log(`  Chain ID: ${this.state.data.deployment.chainId}`);
        this.log(`  Chain Name: ${this.state.data.deployment.chainName}`);
        this.log(`  Rollup: ${this.state.data.deployment.contracts.rollup}`);
        this.log(`  Inbox: ${this.state.data.deployment.contracts.inbox}`);
        this.log(`  Sequencer RPC: http://localhost:${process.env.SEQUENCER_HTTP_PORT || 8547}`);
        this.log('');
        this.log('Verification results:');
        this.log(`  Balance: ${this.state.data.verificationResult.balance} ETH`);
        this.log(`  Block number: ${this.state.data.verificationResult.blockNumber}`);
        this.log(`  Test tx: ${this.state.data.verificationResult.testTransaction.hash}`);
        this.log('');
        this.log('Your L3 is ready to use!');
      }

    } catch (error) {
      this.log(`❌ Error in stage ${this.state.stage}: ${error.message}`);
      this.log(error.stack);
      process.exit(1);
    }
  }
}

// Run orchestrator
const orchestrator = new L3Orchestrator();
orchestrator.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
