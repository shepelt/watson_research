#!/usr/bin/env node

import { createPublicClient, createWalletClient, http, parseEther, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

config();

const DEPLOYMENT_FILE = '/data/deployment.json';
const BOOTSTRAP_RESULT_FILE = '/data/bootstrap-result.json';
const START_TIME = Date.now();

function log(message) {
  const elapsed = ((Date.now() - START_TIME) / 1000).toFixed(1);
  console.log(`[${elapsed}s] ${message}`);
}

async function main() {
  log('=== L3 Bootstrap & Verification ===');

  const deployment = JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);

  const parentRpcUrl = process.env.PARENT_RPC_URL;
  const parentChainId = parseInt(process.env.PARENT_CHAIN_ID);
  const forceIncludeDelaySeconds = parseInt(process.env.FORCE_INCLUDE_DELAY_SECONDS || 60);
  const forceIncludeDelayBlocks = parseInt(process.env.FORCE_INCLUDE_DELAY_BLOCKS || 12);
  const initialDepositAmount = process.env.INITIAL_DEPOSIT_AMOUNT || '0.01';
  const sequencerHttpPort = process.env.SEQUENCER_HTTP_PORT || 8547;

  const publicClient = createPublicClient({
    chain: { id: parentChainId },
    transport: http(parentRpcUrl)
  });

  const walletClient = createWalletClient({
    account,
    chain: { id: parentChainId },
    transport: http(parentRpcUrl)
  });

  // Step 1: Make deposit
  log(`Making deposit of ${initialDepositAmount} ETH...`);

  const inboxAbi = parseAbi(['function depositEth() payable returns (uint256)']);
  const depositAmount = parseEther(initialDepositAmount);

  const depositHash = await walletClient.writeContract({
    address: deployment.contracts.inbox,
    abi: inboxAbi,
    functionName: 'depositEth',
    value: depositAmount,
    gas: 500000n
  });

  log(`Deposit tx: ${depositHash}`);
  const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
  const depositBlock = depositReceipt.blockNumber;
  const depositTime = Date.now();

  log(`✅ Deposit confirmed at block ${depositBlock}`);

  // Step 2: Wait for force-include threshold
  log(`Waiting for force-include threshold: ${forceIncludeDelaySeconds}s AND ${forceIncludeDelayBlocks} blocks`);

  // Wait for time
  const timeToWait = forceIncludeDelaySeconds * 1000;
  log(`Waiting ${forceIncludeDelaySeconds}s for time threshold...`);
  await new Promise(resolve => setTimeout(resolve, timeToWait));
  log('✅ Time threshold met');

  // Wait for blocks
  let currentBlock = await publicClient.getBlockNumber();
  const targetBlock = depositBlock + BigInt(forceIncludeDelayBlocks);

  while (currentBlock < targetBlock) {
    const blocksRemaining = Number(targetBlock - currentBlock);
    log(`Waiting for blocks... (${blocksRemaining} remaining)`);

    // Generate a transaction to help create blocks (for testnets like HPP Sepolia)
    if (blocksRemaining > 0) {
      try {
        const spamHash = await walletClient.sendTransaction({
          to: account.address,
          value: parseEther('0.0001')
        });
        log(`Generated block with tx: ${spamHash.slice(0, 10)}...`);
      } catch (e) {
        // Continue anyway
      }
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    currentBlock = await publicClient.getBlockNumber();
  }
  log('✅ Block threshold met');

  // Give sequencer time to process
  log('Giving sequencer 15s to process delayed messages...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Step 3: Verify L3
  log('Verifying L3...');

  const sequencerRpcUrl = `http://sequencer:${sequencerHttpPort}`;

  const l3Client = createPublicClient({
    transport: http(sequencerRpcUrl)
  });

  const l3WalletClient = createWalletClient({
    account,
    transport: http(sequencerRpcUrl)
  });

  // Check chain ID
  const chainId = await l3Client.getChainId();
  log(`L3 Chain ID: ${chainId}`);

  if (chainId !== deployment.chainId) {
    throw new Error(`Chain ID mismatch: expected ${deployment.chainId}, got ${chainId}`);
  }

  // Check balance
  log('Checking L3 balance...');
  const balance = await l3Client.getBalance({ address: account.address });
  const balanceEth = Number(balance) / 1e18;
  log(`L3 Balance: ${balanceEth.toFixed(6)} ETH`);

  if (balance === 0n) {
    throw new Error('Balance is still 0 - delayed messages may not have been processed yet');
  }

  // Check block number
  const blockNumber = await l3Client.getBlockNumber();
  log(`L3 Block Number: ${blockNumber}`);

  // Send test transaction
  log('Sending test transaction on L3...');
  const testTxHash = await l3WalletClient.sendTransaction({
    to: account.address,
    value: parseEther('0.0001'),
    chain: { id: deployment.chainId }
  });

  log(`Test tx: ${testTxHash}`);
  const testReceipt = await l3Client.waitForTransactionReceipt({ hash: testTxHash });
  log(`✅ Test tx confirmed in block ${testReceipt.blockNumber}`);
  log(`Gas used: ${testReceipt.gasUsed}`);

  // Final block number after test tx
  const finalBlockNumber = await l3Client.getBlockNumber();
  log(`Final L3 block number: ${finalBlockNumber}`);

  // Save results
  const totalTime = ((Date.now() - START_TIME) / 1000 / 60).toFixed(1);

  const result = {
    success: true,
    verification: {
      chainId,
      balance: balanceEth,
      blockNumber: Number(finalBlockNumber),
      testTransaction: {
        hash: testTxHash,
        blockNumber: Number(testReceipt.blockNumber),
        gasUsed: Number(testReceipt.gasUsed)
      }
    },
    timing: {
      depositBlock: Number(depositBlock),
      depositTime: new Date(depositTime).toISOString(),
      forceIncludeWaitSeconds: forceIncludeDelaySeconds,
      forceIncludeWaitBlocks: forceIncludeDelayBlocks,
      totalTimeMinutes: parseFloat(totalTime)
    },
    timestamp: new Date().toISOString()
  };

  writeFileSync(BOOTSTRAP_RESULT_FILE, JSON.stringify(result, null, 2));

  log('');
  log('🎉🎉🎉 L3 IS FULLY OPERATIONAL! 🎉🎉🎉');
  log('');
  log('Summary:');
  log(`  Chain ID: ${deployment.chainId}`);
  log(`  Chain Name: ${deployment.chainName}`);
  log(`  Rollup: ${deployment.contracts.rollup}`);
  log(`  Inbox: ${deployment.contracts.inbox}`);
  log(`  Sequencer RPC: http://localhost:${sequencerHttpPort}`);
  log('');
  log('Verification:');
  log(`  Balance: ${balanceEth.toFixed(6)} ETH`);
  log(`  Block number: ${finalBlockNumber}`);
  log(`  Test tx: ${testTxHash}`);
  log('');
  log(`✅ Bootstrap completed in ${totalTime} minutes`);
}

main().catch(error => {
  console.error('❌ Bootstrap failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
