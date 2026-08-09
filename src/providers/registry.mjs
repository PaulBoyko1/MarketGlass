import { MassiveProvider } from "./massive.mjs";
import { TradierProvider } from "./tradier.mjs";
import { FredProvider } from "./fred.mjs";
import { TwelveDataProvider } from "./twelve-data.mjs";
import { ProviderError } from "./base.mjs";
import { normalizeProviderOptionChain } from "./normalize-options.mjs";

export function createProviderRegistry(environment = process.env, options = {}) {
  const providers = {
    massive: new MassiveProvider(environment, options),
    tradier: new TradierProvider(environment, options),
    fred: new FredProvider(environment, options),
    twelveData: new TwelveDataProvider(environment, options)
  };
  return {
    providers,
    health() {
      return {
        mode: environment.MARKETGLASS_DATA_MODE ?? "demo",
        providers: Object.fromEntries(Object.entries(providers).map(([key, provider]) => [key, provider.health()])),
        fallback_order: {
          underlying_current: ["Tradier", "Twelve Data", "Massive", "cache", "demo"],
          option_chain: ["Massive snapshot capability", "Tradier", "demo"],
          rates: ["FRED", "configured constant", "demo"]
        }
      };
    },
    async optionChain(symbol, expiration) {
      if (providers.massive.capabilities.options_snapshot) {
        return normalizeProviderOptionChain("Massive", await providers.massive.optionChain(symbol, expiration), { symbol });
      }
      if (providers.tradier.capabilities.options_chain) {
        return normalizeProviderOptionChain("Tradier", await providers.tradier.optionChain(symbol, expiration), { symbol });
      }
      throw new ProviderError("MarketGlass", "options_not_configured", "Options chain unavailable. Configure Tradier or an eligible Massive plan.", { status: 503 });
    }
  };
}
