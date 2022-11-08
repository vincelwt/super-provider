import { ethers } from 'ethers'

// https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
const promiseTimeout = (prom: Promise<any>, time: number) =>
  Promise.race([
    prom,
    new Promise((_r, reject) => setTimeout(() => reject('Promise timed out'), time))
  ])

const shuffleArray = (array: any[]) =>
  array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)

const quantile = (arr, q) => {
  const sorted = arr.sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  } else {
    return sorted[base]
  }
}

type SuperProviderOptions =
  | {
      stallTimeout?: number
      maxRetries?: number
      acceptableBlockLag?: number
      benchmarkRuns?: number
      benchmarkFrequency?: number
      mode?: 'spread' | 'parallel'
      maxParallel?: number
    }
  | undefined

export class SuperProvider extends ethers.providers.BaseProvider {
  private readonly providers: ethers.providers.BaseProvider[]

  private cycleIndex: number = 0
  private providersPool: { score: number; provider: ethers.providers.BaseProvider }[]

  private stallTimeout: number
  private maxRetries: number
  private benchmarkRuns: number
  private acceptableBlockLag: number
  private benchmarkFrequency: number
  private maxParallel: number
  private mode: 'spread' | 'parallel'

  constructor (providers: ethers.providers.BaseProvider[], options?: SuperProviderOptions) {
    super(providers[0].network)

    this.providersPool = []
    this.providers = providers

    if (providers.length < 1) {
      throw new Error('SuperProvider requires at least 1 sub-providers to work.')
    }

    if (providers.length < 3) {
      console.warn(
        'SuperProvider needs at least 3 sub-providers to be effective. The more the better.'
      )
    }

    this.stallTimeout = options?.stallTimeout || 4000 // 4s
    this.maxRetries = options?.maxRetries || 3
    this.benchmarkRuns = options?.benchmarkRuns || 3
    this.acceptableBlockLag = options?.acceptableBlockLag || 0
    this.benchmarkFrequency = options?.benchmarkFrequency || 300000 // 5 minutes
    this.mode = options?.mode || 'spread'
    this.maxParallel = options?.maxParallel || 3

    setInterval(() => {
      this.benchmarkProviders()
    }, this.benchmarkFrequency)
  }

  async detectNetwork (): Promise<ethers.providers.Network> {
    return this.providers[0].detectNetwork()
  }

  // if mode is spread, cycle through top providers. Otherwise make request to all top in parallel.
  // retry up to maxAttempts times
  async perform (method: string, params: any): Promise<any> {
    if (!this.providersPool.length) {
      await this.benchmarkProviders()
    }

    const promiseGen = p => promiseTimeout(p.perform(method, params), this.stallTimeout)

    let tries = 0

    const recursiveRetry = async (): Promise<any> => {
      const providers = this.providersToUse()

      try {
        if (this.mode === 'spread') {
          // mode "spread" = cycle through fastest providers
          const provider = providers[this.cycleIndex]
          this.cycleIndex = (this.cycleIndex + 1) % providers.length

          return await promiseGen(provider)
        } else {
          // mode "parallel" = run in parallel and return as soon as one succeeds
          return await Promise.any(providers.map(promiseGen))
        }
      } catch (error) {
        if (tries >= this.maxRetries) throw error

        // @ts-ignore
        console.log(`SuperProvider: error with ${method}: ${error?.message} - retrying...`)

        tries++

        recursiveRetry()
      }
    }

    return recursiveRetry()
  }

  async benchmarkProviders (): Promise<void> {
    if (this.providers.length <= 2) {
      this.providersPool = this.providers.map(provider => ({ score: 1, provider }))
      return
    }

    // run benchmark n times and sort by the average response time (lower is better).
    // downrank providers with blockNumber less than acceptableBlockDeviation

    const run = async () => {
      // shuffle providers to avoid bias
      const promises = shuffleArray(this.providers).map(async provider => {
        const startTime = Date.now()
        try {
          const call = provider.perform('getBlockNumber', {})
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

      const results = (await Promise.all(promises)).filter(p => p) as {
        provider: ethers.providers.BaseProvider
        responseTime: number
        block: number
      }[]

      // take 3rd quartile of blockHeights as current block height to avoid outliers
      const currentBlock = quantile(
        results.map(p => p.block),
        0.75
      )

      const filteredResults = results.filter(p => currentBlock - p.block <= this.acceptableBlockLag)

      return filteredResults
    }

    // run benchmark n times sequentially
    const results = [] as any[]
    for (let i = 0; i < this.benchmarkRuns; i++) {
      results.push(await run())
    }

    // group results by provider, calc avg response time and sort by it
    const sortedResults = results
      .flat()
      .reduce(
        (acc, result) => {
          const existing = acc.find(r => r.provider === result.provider)
          if (existing) {
            existing.responseTime += result.responseTime
            existing.count++
          } else {
            acc.push({ ...result, count: 1 })
          }
          return acc
        },

        [] as { provider: ethers.providers.BaseProvider; responseTime: number; count: number }[]
      )
      .filter(r => r.count === this.benchmarkRuns)
      .map(r => ({ ...r, avgResponseTime: r.responseTime / r.count }))
      .sort((a, b) => a.avgResponseTime - b.avgResponseTime)

    console.log(
      `SuperProvider: benchmark x${this.benchmarkRuns} finished. sorted providers:`,
      sortedResults.map(
        // @ts-ignore
        p => `${p.provider?.connection?.url} | avg ${parseInt(p.avgResponseTime)}ms`
      )
    )

    if (!sortedResults.length) {
      throw new Error('SuperProvider: No healthy providers available.')
    }

    if (sortedResults.length < 3) {
      console.warn(
        `SuperProvider: Only ${sortedResults.length} healthy providers available. Add more providers for robustness.`
      )
    }

    this.providersPool = sortedResults.map(r => ({
      provider: r.provider,
      score: 1 / r.avgResponseTime // higher is better
    }))

    // reset cycle index
    this.cycleIndex = 0
  }

  // if raceMode > 0, return top n providers, otherwise return providers with score above median
  providersToUse (): ethers.providers.BaseProvider[] {
    if (this.providersPool.length <= 2) {
      return this.providersPool.map(p => p.provider)
    }

    const sorted = this.providersPool.sort((a, b) => b.score - a.score)

    if (this.mode === 'parallel') {
      return sorted.slice(0, this.maxParallel).map(p => p.provider)
    }

    const q2 = quantile(
      sorted.map(p => p.score),
      0.5
    )

    return sorted.filter(p => p.score >= q2).map(p => p.provider)
  }
}
