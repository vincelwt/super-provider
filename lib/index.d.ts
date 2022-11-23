import { BaseProvider, Network } from "@ethersproject/providers";
type SuperProviderOptions = {
    stallTimeout?: number;
    maxRetries?: number;
    acceptableBlockLag?: number;
    benchmarkRuns?: number;
    benchmarkFrequency?: number;
    mode?: "spread" | "parallel";
    maxParallel?: number;
};
export declare class SuperProvider extends BaseProvider {
    private readonly providers;
    private chainId;
    private cycleIndex;
    private providersPool;
    private stallTimeout;
    private maxRetries;
    private benchmarkRuns;
    private acceptableBlockLag;
    private benchmarkFrequency;
    private maxParallel;
    private mode;
    constructor(providers: BaseProvider[], chainId?: any, options?: SuperProviderOptions);
    detectNetwork(): Promise<Network>;
    getNetwork(): Promise<Network>;
    perform(method: string, params: any): Promise<any>;
    banProvider(provider: BaseProvider): void;
    providersToUse(): BaseProvider[];
    benchmarkProviders(): Promise<void>;
}
export {};
