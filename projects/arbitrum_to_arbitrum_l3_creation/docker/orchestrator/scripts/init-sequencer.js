#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

config();

const DEPLOYMENT_FILE = '/data/deployment.json';
const CHAIN_INFO_FILE = '/data/chain-info.json';

console.log('[Sequencer Init] Waiting for deployment.json...');

// Wait for deployment.json to exist (created by orchestrator)
const maxWaitTime = 600000; // 10 minutes
const checkInterval = 2000; // 2 seconds
let elapsed = 0;

const waitForDeployment = () => {
  return new Promise((resolve, reject) => {
    const check = setInterval(() => {
      if (existsSync(DEPLOYMENT_FILE)) {
        clearInterval(check);
        resolve();
      } else if (elapsed >= maxWaitTime) {
        clearInterval(check);
        reject(new Error('Timeout waiting for deployment.json'));
      }
      elapsed += checkInterval;
    }, checkInterval);
  });
};

await waitForDeployment();

console.log('[Sequencer Init] Found deployment.json, generating chain-info.json...');

const deployment = JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'));

const chainInfo = [{
  "chain-id": deployment.chainId,
  "chain-name": deployment.chainName,
  "parent-chain-id": deployment.parentChainId,
  "parent-chain-is-arbitrum": true,
  "chain-config": {
    "chainId": deployment.chainId,
    "homesteadBlock": 0,
    "daoForkBlock": null,
    "daoForkSupport": true,
    "eip150Block": 0,
    "eip150Hash": "0x0000000000000000000000000000000000000000000000000000000000000000",
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "istanbulBlock": 0,
    "muirGlacierBlock": 0,
    "berlinBlock": 0,
    "londonBlock": 0,
    "clique": {
      "period": 0,
      "epoch": 0
    },
    "arbitrum": {
      "EnableArbOS": true,
      "AllowDebugPrecompiles": false,
      "DataAvailabilityCommittee": false,
      "InitialArbOSVersion": 11,
      "GenesisBlockNum": 0,
      "MaxCodeSize": 24576,
      "MaxInitCodeSize": 49152,
      "InitialChainOwner": deployment.deployer
    }
  },
  "rollup": {
    "bridge": deployment.contracts.bridge,
    "inbox": deployment.contracts.inbox,
    "sequencer-inbox": deployment.contracts.sequencerInbox,
    "rollup": deployment.contracts.rollup,
    "validator-utils": "0x0000000000000000000000000000000000000000",
    "validator-wallet-creator": "0x0000000000000000000000000000000000000000",
    "deployed-at": deployment.deploymentBlock
  }
}];

writeFileSync(CHAIN_INFO_FILE, JSON.stringify(chainInfo, null, 2));

console.log('[Sequencer Init] ✅ chain-info.json created');
console.log(JSON.stringify(chainInfo, null, 2));
