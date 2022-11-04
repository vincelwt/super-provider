import { ethers } from 'ethers'

// Takes providers as argument and point to one that works.
// On error, cycles through providers until one works consistently.
// If error with the provider or a call takes more than stallTimeout, cycle to the next provider and try again the call

export class FallthroughProvider extends ethers.providers.BaseProvider {
  private readonly providers: ethers.providers.BaseProvider[]
  private currentProviderIndex = 0
  private currentProvider: ethers.providers.BaseProvider
  private activeListeners: { [event: string]: ethers.providers.Listener } = {}
  private stallTimeout: number = 1000
  private timeout: any

  constructor (providers: ethers.providers.BaseProvider[], stallTimeout = 1000) {
    super(providers[0].network)

    this.providers = providers
    this.stallTimeout = stallTimeout
    this.currentProvider = providers[0]
  }

  async detectNetwork (): Promise<ethers.providers.Network> {
    return this.currentProvider.detectNetwork()
  }

  // if a call fails or takes more than stallTimeout, cycle to the next provider and try again the call
  async perform (method: string, params: any): Promise<any> {
    // console.log('Performing', method, params)

    if (this.timeout) {
      clearTimeout(this.timeout)
    }

    const cycleAndRetry = () => {
      console.log(`Retrying ${method}`)
      clearTimeout(this.timeout)
      this.cycleProvider()
      this.timeout = null
      this.perform(method, params)
    }

    this.timeout = setTimeout(() => {
      console.log(`Provider timed out doing ${method}.`)
      cycleAndRetry()
    }, this.stallTimeout)

    try {
      const result = await this.currentProvider.perform(method, params)
      clearTimeout(this.timeout)
      this.timeout = null

      return result
    } catch (err) {
      console.log(`Provider errored doing ${method}.`)
      cycleAndRetry()
      // throw err
    }
  }

  cycleProvider (): void {
    console.log('Cycling provider')
    this.removeAllListeners()

    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length
    this.currentProvider = this.providers[this.currentProviderIndex]

    // Re-attach listeners to new provider
    Object.keys(this.activeListeners).forEach(eventName => {
      this.currentProvider.on(eventName, this.activeListeners[eventName])
    })

    // Listen to error events on new provider
    this.currentProvider.on('error', err => {
      console.log('Error emitted by provider', err)
      this.cycleProvider()
    })
  }

  on (eventName: string, listener: ethers.providers.Listener): this {
    if (!this.activeListeners[eventName]) {
      // Save listener to re-attach it when cycling providers
      this.activeListeners[eventName] = listener

      // Attach to current
      this.currentProvider.on(eventName, listener)
    }

    return this
  }

  removeAllListeners (eventName?: string): this {
    // remove all listeners from all providers
    this.providers.forEach(provider => provider.removeAllListeners(eventName))

    return this
  }
}
