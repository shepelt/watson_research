import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const watsonL3V2 = {
  id: 987654322,
  name: 'Watson L3 v2',
  network: 'watson-l3-v2',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['http://localhost:8547'] },
    public: { http: ['http://localhost:8547'] },
  },
  testnet: true,
};

async function testL3Transaction() {
  console.log('=== Testing Direct L3 Transaction ===\n');

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: watsonL3V2,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: watsonL3V2,
    transport: http(),
  });

  try {
    const chainId = await publicClient.getChainId();
    const blockNumber = await publicClient.getBlockNumber();
    const balance = await publicClient.getBalance({ address: account.address });

    console.log('✅ L3 Sequencer is responsive!');
    console.log('Chain ID:', chainId);
    console.log('Block Number:', blockNumber.toString());
    console.log('Balance:', (Number(balance) / 1e18).toFixed(6), 'ETH');
    console.log('');

    if (balance > 0n) {
      console.log('We have balance! Let me send a test transaction...');
      console.log('');

      const hash = await walletClient.sendTransaction({
        to: account.address, // Send to ourselves
        value: parseEther('0.0001'),
      });

      console.log('Transaction sent:', hash);
      console.log('Waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      console.log('✅ Transaction confirmed!');
      console.log('Block:', receipt.blockNumber.toString());
      console.log('Gas used:', receipt.gasUsed.toString());
      console.log('');
      console.log('🎉🎉🎉 L3 IS WORKING! Transactions are being sequenced!');
    } else {
      console.log('No balance on L3 yet - delayed messages not yet processed.');
      console.log('This is expected if L2 (HPP Sepolia) is not producing blocks.');
      console.log('');
      console.log('⏳ Waiting for L2 blocks to advance so force-include can trigger...');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testL3Transaction()
  .then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed:', error.message);
    process.exit(1);
  });
