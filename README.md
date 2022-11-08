# super-provider

Meta-provider for Ethers.js engineered for optimal speed, reliability and network usage.

Best used with many sub providers.

### How it works

- It will regularly benchmark (with `getBlockNumber`) the providers supplied and rank them by response time. Providers lagging in blocks won't be used.
- Depending on the selected mode: Calls are either:
  - spread between the top 3 fastest providers (default)
  - send to the fastest providers in parallel and the first response is returned (fastest)
- If any call fails or stalls, it is automatically retried on another provider.

## Installation

```bash
npm install super-provider
```

## Example Usage

```typescript
import { SuperProvider } from 'super-provider';

import { ethers } from 'ethers'

const rpcs = [
  "https://api.mycryptoapi.com/eth",
  "https://cloudflare-eth.com",
  "https://eth-mainnet.public.blastapi.io",
  "https://rpc.ankr.com/eth"
]

const provider = new SuperProvider(rpcs.map(url => new ethers.providers.JsonRpcProvider(url)))

const blockNumber = await provider.getBlockNumber()
console.log(blockNumber)
```

## API

### `new SuperProvider(providers: Provider[], options?: SuperProviderOptions)`
- `providers`: Array of providers to use
- `options`: Options for the super provider

### `options`
- `mode`: Mode to use for calls. Either `spread` or `parallel`. Default: `spread`
- `maxRetries`: Maximum number of retries for a call. Default: `3`
- `benchmarkFrequency`: Interval between benchmarks. Default: `300000` (5 minutes)
- `acceptableBlockLag`: Maximum number of blocks a provider can lag behind the fastest provider. Default: `0`
- `benchmarkRuns`: Number of runs for each benchmark. Default: `3`
- `stallTimeout`: Timeout for a call to be considered stalled. Default: `4000` (4 seconds)
- `maxParallel`: Maximum number of parallel calls. Default: `3`


## Caveats

- Currently doesn't support subscriptions & listening to events with `.on()`. PR welcome.
- Doesn't have a concept of quorum and doesn't compare results.
- Lots of untested edge cases.

## Credit

Inspiration taken from ethers's [FallbackProvider](https://docs.ethers.io/v5/api/providers/other/), essential-eth's [FallthroughProvider](https://github.com/dawsbot/essential-eth/blob/master/src/providers/FallthroughProvider.ts) and Chainlist's [auto RPC benchmarking](https://chainlist.org/chain/1).

## Used by

Used by [alt0.io](https://alt0.io) to provide highly reliable and fast chain listening.