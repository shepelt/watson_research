import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  Address,
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

const deployment = JSON.parse(
  fs.readFileSync('./watson-l3-v2-deployment.json', 'utf-8')
);

async function stakeValidator() {
  console.log('=== Staking Validator on Watson L3 v2 ===\n');

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

  const rollupAddress = deployment.contracts.rollup as Address;
  const stakeTokenAddress = deployment.stakeToken as Address;

  console.log('Rollup:', rollupAddress);
  console.log('StakeToken:', stakeTokenAddress);
  console.log('Validator:', account.address);
  console.log('');

  // Approve stake token
  const stakeAmount = parseEther('0.1');
  const approveABI = [
    {
      inputs: [
        { name: 'spender', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      name: 'approve',
      outputs: [{ name: '', type: 'bool' }],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ] as const;

  console.log('Approving 0.1 WST...');
  const approveHash = await walletClient.writeContract({
    address: stakeTokenAddress,
    abi: approveABI,
    functionName: 'approve',
    args: [rollupAddress, stakeAmount],
  });

  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log('✅ Approved');
  console.log('');

  // Stake
  const rollupABI = [
    {
      inputs: [
        { name: 'tokenAmount', type: 'uint256' },
        { name: 'withdrawalAddress', type: 'address' },
      ],
      name: 'newStake',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ] as const;

  console.log('Staking 0.1 WST...');
  const stakeHash = await walletClient.writeContract({
    address: rollupAddress,
    abi: rollupABI,
    functionName: 'newStake',
    args: [stakeAmount, account.address],
  });

  console.log('Transaction sent:', stakeHash);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: stakeHash,
  });

  console.log('✅ Staked!');
  console.log('Block:', receipt.blockNumber.toString());
}

stakeValidator()
  .then(() => {
    console.log('\n✅ Validator staked on Watson L3 v2!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
