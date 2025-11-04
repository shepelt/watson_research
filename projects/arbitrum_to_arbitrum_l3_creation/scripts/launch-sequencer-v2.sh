#!/bin/bash

# Watson L3 v2 Sequencer Launcher (60-second delay!)

echo "=== Watson L3 v2 Sequencer Launcher ==="
echo ""

# Stop any existing containers
echo "Stopping any existing Watson L3 containers..."
docker stop watson-l3-sequencer 2>/dev/null || true
docker stop watson-l3-v2-sequencer 2>/dev/null || true
docker rm watson-l3-sequencer 2>/dev/null || true
docker rm watson-l3-v2-sequencer 2>/dev/null || true

# Create data directory
mkdir -p ~/watson/nitro-data-v2

echo "Launching Watson L3 v2 sequencer node..."
echo ""
echo "Parent Chain: HPP Sepolia (https://sepolia.hpp.io)"
echo "L3 Chain ID: 987654322"
echo "HTTP Port: 8547"
echo "WS Port: 8548"
echo "Force-Include Delay: 60 SECONDS! ⚡"
echo ""

# Read private key from .env and remove 0x prefix
DEPLOYER_PRIVKEY=$(grep DEPLOYER_PRIVATE_KEY ~/watson/.env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | sed 's/^0x//')

# Launch Nitro node with v2 deployment addresses
docker run -d \
  --name watson-l3-v2-sequencer \
  -p 8547:8547 \
  -p 8548:8548 \
  -v ~/watson/nitro-data-v2:/data \
  offchainlabs/nitro-node:v3.2.1-d81324d \
  --conf.env-prefix=NITRO \
  --node.feed.output.enable=false \
  --http.addr=0.0.0.0 \
  --http.port=8547 \
  --http.vhosts='*' \
  --http.corsdomain='*' \
  --http.api=eth,net,web3,arb,debug,personal \
  --ws.addr=0.0.0.0 \
  --ws.port=8548 \
  --ws.origins='*' \
  --ws.api=eth,net,web3,arb,debug \
  --chain.id=987654322 \
  --parent-chain.connection.url=https://sepolia.hpp.io \
  --node.sequencer=true \
  --node.dangerous.no-sequencer-coordinator=true \
  --node.staker.enable=false \
  --node.batch-poster.enable=true \
  --node.batch-poster.max-size=90000 \
  --node.batch-poster.max-delay=1s \
  --node.batch-poster.parent-chain-wallet.private-key="$DEPLOYER_PRIVKEY" \
  --execution.sequencer.enable=true \
  --execution.forwarding-target= \
  --node.delayed-sequencer.enable=true \
  --node.delayed-sequencer.use-merge-finality=false \
  --node.delayed-sequencer.finalize-distance=1 \
  --chain.info-json='[{"chain-id":987654322,"parent-chain-id":181228,"parent-chain-is-arbitrum":true,"chain-name":"Watson L3 v2","chain-config":{"chainId":987654322,"homesteadBlock":0,"daoForkBlock":null,"daoForkSupport":true,"eip150Block":0,"eip150Hash":"0x0000000000000000000000000000000000000000000000000000000000000000","eip155Block":0,"eip158Block":0,"byzantiumBlock":0,"constantinopleBlock":0,"petersburgBlock":0,"istanbulBlock":0,"muirGlacierBlock":0,"berlinBlock":0,"londonBlock":0,"clique":{"period":0,"epoch":0},"arbitrum":{"EnableArbOS":true,"AllowDebugPrecompiles":true,"DataAvailabilityCommittee":false,"InitialArbOSVersion":32,"InitialChainOwner":"0xF3Ac9af2367393d0faC75ae4d31cAe340ceb0051","GenesisBlockNum":0}},"rollup":{"bridge":"0x16e1c495c9701884b73517e894eda1F5ac9923Be","inbox":"0x2c85415428DBAfC7024c6963A0ED5D37051A93B1","sequencer-inbox":"0x9fa75916B359eA82f36F0A18B5A38434e3B2c184","rollup":"0x73019d8042130e0A84beb2BFF5838B15632eE68D","validator-utils":"0x0000000000000000000000000000000000000000","validator-wallet-creator":"0xAe6c6Da8406f6efa865C887F55Da4CEaB1F4865b","deployed-at":1873}}]' \
  --persistent.chain /data

sleep 3

# Check if container is running
if docker ps | grep -q watson-l3-v2-sequencer; then
  echo "✅ Watson L3 v2 sequencer is running!"
  echo ""
  echo "Container: watson-l3-v2-sequencer"
  echo "HTTP RPC: http://localhost:8547"
  echo "WebSocket: ws://localhost:8548"
  echo ""
  echo "⚡ FAST MODE: Delayed messages will be force-included after 60 seconds!"
  echo ""
  echo "To view logs:"
  echo "  docker logs -f watson-l3-v2-sequencer"
  echo ""
  echo "To stop:"
  echo "  docker stop watson-l3-v2-sequencer"
else
  echo "❌ Failed to start sequencer"
  echo "Check logs with: docker logs watson-l3-v2-sequencer"
  exit 1
fi
