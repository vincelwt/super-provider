# fallthrough-provider

Resilient provider for Ethers.js that will switch to the next provider in the list if the current is too slow or fails.

Inspired by essential-eth's [fallthrough provider](https://github.com/dawsbot/essential-eth/blob/master/src/providers/FallthroughProvider.ts).

Great if you use unreliable or public RPCs or need a provider that never goes down.

Supports listening to events with `.on()`.

## Installation

```bash
npm install fallthrough-provider
```

## Example Usage

```typescript
import { FallthroughProvider } from 'fallthrough-provider';

import { ethers } from 'ethers'

const rpcs = [
  "https://api.mycryptoapi.com/eth",
  "https://cloudflare-eth.com",
  "https://eth-mainnet.public.blastapi.io",
  "https://rpc.ankr.com/eth"
]

const provider = new FallthroughProvider(rpcs.map(url => new ethers.providers.JsonRpcProvider(url)))

const blockNumber = await provider.getBlockNumber()
console.log(blockNumber)
```

Used by [alt0.io](https://alt0.io) to provide highly reliable and fast chain listening.