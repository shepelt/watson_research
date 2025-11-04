import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

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

async function spamBlocks() {
  console.log('=== Creating L2 transactions to produce blocks ===\n');

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

  const startBlock = await publicClient.getBlockNumber();
  console.log('Starting L2 block:', startBlock);
  console.log('Creating 15 transactions to trigger 12 blocks...\n');

  for (let i = 0; i < 15; i++) {
    try {
      const hash = await walletClient.sendTransaction({
        to: account.address,
        value: parseEther('0.0001'),
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`Tx ${i + 1}: Block ${receipt.blockNumber}`);

      await new Promise(r => setTimeout(r, 1000)); // Wait 1 second between txs
    } catch (error: any) {
      console.error(`Tx ${i + 1} failed:`, error.message);
    }
  }

  const endBlock = await publicClient.getBlockNumber();
  console.log('\nEnding L2 block:', endBlock);
  console.log('Blocks created:', Number(endBlock - startBlock));
}

spamBlocks()
  .then(() => {
    console.log('\n✅ Done creating L2 blocks!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
