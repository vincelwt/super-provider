<p align="center">
  <img src="https://alt0.io/superprovider.svg" />
</p>

Used by [alt0.io](https://alt0.io) to provide highly reliable and fast chain listening.

### How it works

- You supply it with a list of regular providers
- It will frequently benchmark (with `getBlockNumber`) the providers supplied and rank them by response time. Providers lagging in blocks won't be used.
- Depending on the selected mode, calls are either:
  - spread in cycles between the fastest providers (default)
  - sent to the fastest providers in parallel and the first response is returned (fastest)
- If any call fails or stalls, it is retried on another provider with an exponential backoff.

## Installation

```bash
npm install ethers-super-provider
```

## Example Usage

```typescript
import { SuperProvider } from "ethers-super-provider"

import { ethers } from "ethers"

const rpcs = [
  "https://api.mycryptoapi.com/eth",
  "https://cloudflare-eth.com",
  "https://eth-mainnet.public.blastapi.io",
  "https://rpc.ankr.com/eth",
]

const provider = new SuperProvider(rpcs.map((url) => new ethers.providers.JsonRpcProvider(url)))

const blockNumber = await provider.getBlockNumber()
console.log(blockNumber)
```

## API

### `new SuperProvider(providers: Provider[], chainId: number, options?: SuperProviderOptions)`

- `providers`: Array of providers to use
- `chainId`: Chain ID to use (default: 1 / eth mainnet)
- `options`: Options for the super provider

### `options`

- `mode`: Mode to use for calls. Either `spread` or `parallel`. Default: `spread`
- `maxRetries`: Maximum number of retries for a call. Default: `3`
- `benchmarkFrequency`: Interval between benchmarks. Default: `200000` (~3 minutes)
- `acceptableBlockLag`: Maximum number of blocks a provider can lag behind the fastest provider. Default: `0`
- `benchmarkRuns`: Number of runs for each benchmark. Default: `2`
- `stallTimeout`: Timeout for a call to be considered stalled. Default: `4000` (4 seconds)
- `maxParallel`: Maximum number of parallel calls. Default: `3`

### Which mode to use?

- if you are not doing very frequent calls and/or want the absolute fastest results, regardless of network use or cost, use `parallel` which will send the request to many providers in parallel and return the first available response.

- for all other uses (espsecially if you are doing a lot of requests at once) use `spread` (default) which is more efficient. Limit expensive API calls to a provider. This is also more respectful for public providers as it won't flood them with requests you won't use.

## Caveats

- Currently doesn't support subscriptions & listening to events with `.on()`. PR welcome.
- Doesn't have a concept of quorum and doesn't compare results.
- Lots of untested edge cases.

## Credit

Inspiration taken from ethers's [FallbackProvider](https://docs.ethers.io/v5/api/providers/other/), essential-eth's [FallthroughProvider](https://github.com/dawsbot/essential-eth/blob/master/src/providers/FallthroughProvider.ts) and Chainlist's [auto RPC benchmarking](https://chainlist.org/chain/1).

## Used by

- [alt0.io](alt0.io)

## Author

plz follow me [on twitter](https://twitter.com/vincelwt) I don't have many followers
