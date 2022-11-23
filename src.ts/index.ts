import { BaseProvider, Network } from "@ethersproject/providers"

// https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
import {
  promiseTimeout,
  shuffleArray,
  quantile,
  expRetryTimeout,
  // RATE_LIMIT_KEYWORDS,
} from "./utils"

type SuperProviderOptions = {
  stallTimeout?: number
  maxRetries?: number
  acceptableBlockLag?: number
  benchmarkRuns?: number
  benchmarkFrequency?: number
  mode?: "spread" | "parallel"
  maxParallel?: number
}

export class SuperProvider extends BaseProvider {
  private readonly providers: BaseProvider[]

  private chainId: number
  private cycleIndex: number = 0
  // private lastCycle: Date = new Date()
  private providersPool: { score: number; provider: BaseProvider }[] = []

  private stallTimeout: number
  private maxRetries: number
  private benchmarkRuns: number
  private acceptableBlockLag: number
  private benchmarkFrequency: number
  private maxParallel: number
  private mode: "spread" | "parallel"

  constructor(providers: BaseProvider[], chainId?, options?: SuperProviderOptions) {
    super(chainId || 1)

    this.chainId = chainId || 1
    this.providers = providers

    if (providers.length < 1) {
      throw new Error("SuperProvider requires at least 1 sub-providers to work.")
    }

    if (providers.length < 3) {
      console.warn(
        "SuperProvider needs at least 3 sub-providers to be effective. The more the better."
      )
    }

    this.stallTimeout = options?.stallTimeout || 6000
    this.maxRetries = options?.maxRetries || 3
    this.benchmarkRuns = options?.benchmarkRuns || 2
    this.acceptableBlockLag = options?.acceptableBlockLag || 0
    this.benchmarkFrequency = options?.benchmarkFrequency || 200000 // ~3 min
    this.mode = options?.mode || "spread"
    this.maxParallel = options?.maxParallel || 3

    // initialize providersPool with all providers equal, will be refined by the benchmark.
    this.providersPool = providers.map((p) => ({ score: 1, provider: p }))

    this.benchmarkProviders()

    setInterval(() => {
      this.benchmarkProviders()
    }, this.benchmarkFrequency)
  }

  // manually override/disable network detections as it causes issues with some providers
  // originally this in Ethers is used to detect underlying network changes (rare use case),
  // but now we just use the chainId passed in constructor
  async detectNetwork(): Promise<Network> {
    return {
      name: "", // TODO: get network name (required by type Network)
      chainId: this.chainId,
    }
  }

  async getNetwork(): Promise<Network> {
    return {
      name: "",
      chainId: this.chainId,
    }
  }

  // if mode is spread, cycle through top  Otherwise make request to all top in parallel.
  // retry up to maxAttempts times
  async perform(method: string, params: any): Promise<any> {
    const promiseGen = async (p) => {
      try {
        return await promiseTimeout(p.perform(method, params), this.stallTimeout)
      } catch (e) {
        this.banProvider(p)

        // // check the error message if it's a rate limit
        // if (RATE_LIMIT_KEYWORDS.find(k => e?.message?.toLowerCase().includes(k))) {
        //   // if we hit a rate limit, we ban the provider
        //   console.log(`SuperProvider: Temporarily banning provider ${p.connection?.url} due to detected rate limit.`)
        //   this.banProvider(p)
        // }

        throw e
      }
    }

    let tries = 0

    const recursiveRetry = async (): Promise<any> => {
      const providers = this.providersToUse()

      try {
        if (this.mode === "spread") {
          // mode "spread" = cycle through fastest providers to spread load
          const provider = providers[this.cycleIndex]
          this.cycleIndex = (this.cycleIndex + 1) % providers.length

          return await promiseGen(provider)
        } else {
          // mode "parallel" = run in parallel and return as soon as one succeeds
          return await Promise.any(providers.map(promiseGen))
        }
      } catch (error) {
        if (tries >= this.maxRetries) throw error

        tries++

        // slice message, sometimes weirdly contains the whole error
        console.error(
          `SuperProvider: error with ${method} - retrying ${tries}/${this.maxRetries}...`,
          error?.message?.slice(0, 100)
        )

        // exponential backoff delay
        await expRetryTimeout(tries)

        recursiveRetry()
      }
    }

    return recursiveRetry()
  }

  // provider won't be used until next benchmark
  banProvider(provider: BaseProvider) {
    if (this.providersPool.length <= 1) return

    this.providersPool = this.providersPool.filter((p) => p.provider !== provider)

    if (!this.providersPool[this.cycleIndex]) {
      this.cycleIndex = 0
    }
  }

  // if raceMode > 0, return top n providers, otherwise return providers with score above median
  providersToUse(): BaseProvider[] {
    if (this.providersPool.length <= 2) {
      return this.providersPool.map((p) => p.provider)
    }

    const sorted = this.providersPool.sort((a, b) => b.score - a.score)

    if (this.mode === "parallel") {
      return sorted
        .slice(0, Math.min(this.maxParallel, this.providersPool.length))
        .map((p) => p.provider)
    }

    return sorted.map((p) => p.provider)
  }

  async benchmarkProviders(): Promise<void> {
    if (this.providers.length <= 2) {
      this.providersPool = this.providers.map((provider) => ({ score: 1, provider }))
      return
    }

    // run benchmark n times and sort by the average response time (lower is better).
    // downrank providers with blockNumber less than acceptableBlockDeviation

    const run = async () => {
      // shuffle providers to avoid bias
      const promises = shuffleArray(this.providers).map(async (provider) => {
        const startTime = Date.now()
        try {
          const call = provider.perform("getBlockNumber", {})
          const blockHex = await promiseTimeout(call, this.stallTimeout)
          const block = parseInt(blockHex, 16)
          const responseTime = Date.now() - startTime
          return { provider, responseTime, block }
        } catch (error) {
          // @ts-ignore
          // console.error('Provider failed in benchmark', provider?.connection?.url)
          return null
        }
      })

      // send in parallel to be able to compare block returned
      const results = (await Promise.all(promises)).filter((p) => p) as {
        provider: BaseProvider
        responseTime: number
        block: number
      }[]

      // take 3rd quartile of blockHeights as current block height and late providers below
      const currentBlock = quantile(
        results.map((p) => p.block),
        0.75
      )

      const onlyUpToDate = results.filter((p) => currentBlock - p.block <= this.acceptableBlockLag)
      return onlyUpToDate
    }

    // run benchmark n times sequentially
    const results = [] as any[]
    for (let i = 0; i < this.benchmarkRuns; i++) {
      results.push(await run())
    }

    const sortedResults = results
      .flat()
      // group benchmark results by provider
      .reduce(
        (acc, result) => {
          const existing = acc.find((r) => r.provider === result.provider)
          if (existing) {
            existing.responseTime += result.responseTime
            existing.count++
          } else {
            acc.push({ ...result, count: 1 })
          }
          return acc
        },

        [] as { provider: BaseProvider; responseTime: number; count: number }[]
      )
      // only keep those that successful in all runs
      .filter((r) => r.count === this.benchmarkRuns)
      // calc avg response time
      .map((r) => ({ ...r, avgResponseTime: r.responseTime / r.count }))

      // sort by avg response time
      .sort((a, b) => a.avgResponseTime - b.avgResponseTime)

    // exclude providers > 50% slower from median (q2)
    const median = quantile(
      sortedResults.map((r) => r.avgResponseTime),
      0.5
    )

    const filteredResults = sortedResults.filter((r) => r.avgResponseTime <= median * 1.5)

    console.log(
      `SuperProvider: benchmark x${this.benchmarkRuns} finished. sorted providers:`,
      filteredResults.map(
        (p) => `${p.provider.connection?.url} | avg ${parseInt(p.avgResponseTime)}ms`
      )
    )

    if (!filteredResults.length) {
      throw new Error("SuperProvider: No healthy providers available.")
    }

    if (filteredResults.length < 3) {
      console.warn(
        `SuperProvider: Only ${filteredResults.length} healthy providers available. Add more providers for robustness.`
      )
    }

    this.providersPool = filteredResults.map((r) => ({
      provider: r.provider,
      score: 1 / r.avgResponseTime, // higher is better
    }))

    // reset cycle index
    this.cycleIndex = 0
  }
}
