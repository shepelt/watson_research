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

async function depositToL3() {
  console.log('=== Depositing to Watson L3 v2 ===\n');

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

  const inboxAddress = deployment.contracts.inbox as Address;
  const depositAmount = parseEther('0.01'); // 0.01 ETH

  console.log('Inbox:', inboxAddress);
  console.log('From:', account.address);
  console.log('Amount:', '0.01 ETH');
  console.log('');

  const inboxABI = [
    {
      inputs: [],
      name: 'depositEth',
      outputs: [{ name: '', type: 'uint256' }],
      stateMutability: 'payable',
      type: 'function',
    },
  ] as const;

  console.log('Depositing...');
  const hash = await walletClient.writeContract({
    address: inboxAddress,
    abi: inboxABI,
    functionName: 'depositEth',
    value: depositAmount,
  });

  console.log('Transaction sent:', hash);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ Deposited!');
  console.log('Block:', receipt.blockNumber.toString());
  console.log('');
  console.log('⚡ With 60-second delay, this should be force-included in ~1 minute!');
  console.log('   (Check sequencer logs in 60 seconds)');
}

depositToL3()
  .then(() => {
    console.log('\n✅ Deposit complete! Wait 60 seconds for force-inclusion.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
