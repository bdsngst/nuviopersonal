import axios from "axios";
import vm from "vm";
import type { Provider, Stream } from "@shared/schema";
import {
  getEnabledNuvioStreamsProviders,
  getAllNuvioStreamsProviderStreams,
  getNuvioStreamsAsProviderList,
} from "./nuvio-streams";

const NUVIO_REPO_BASE = "https://raw.githubusercontent.com/yoruix/nuvio-providers/main";

export interface ProviderManifest {
  name: string;
  version: string;
  scrapers: Provider[];
}

let cachedManifest: ProviderManifest | null = null;
let manifestLastFetch = 0;
const MANIFEST_CACHE_TTL = 5 * 60 * 1000;

export async function fetchNuvioManifest(): Promise<ProviderManifest> {
  const now = Date.now();
  if (cachedManifest && now - manifestLastFetch < MANIFEST_CACHE_TTL) {
    return cachedManifest;
  }

  try {
    const response = await axios.get(`${NUVIO_REPO_BASE}/manifest.json`, {
      timeout: 10000,
    });
    cachedManifest = response.data;
    manifestLastFetch = now;
    return cachedManifest!;
  } catch (error) {
    console.error("[Nuvio] Failed to fetch manifest:", error);
    if (cachedManifest) return cachedManifest;
    return {
      name: "Nuvio Providers",
      version: "1.0.0",
      scrapers: [],
    };
  }
}

export async function getEnabledProviders(): Promise<Provider[]> {
  const manifest = await fetchNuvioManifest();
  const nuvioProviders = manifest.scrapers.filter((p) => p.enabled);
  const nuvioStreamsProviders = getNuvioStreamsAsProviderList();
  return [...nuvioProviders, ...nuvioStreamsProviders];
}

const providerCodeCache: Map<string, { code: string; fetchedAt: number }> = new Map();
const PROVIDER_CACHE_TTL = 10 * 60 * 1000;

async function fetchProviderCode(provider: Provider): Promise<string | null> {
  const cached = providerCodeCache.get(provider.id);
  const now = Date.now();
  
  if (cached && now - cached.fetchedAt < PROVIDER_CACHE_TTL) {
    return cached.code;
  }

  try {
    const url = `${NUVIO_REPO_BASE}/${provider.filename}`;
    console.log(`[Nuvio] Fetching provider code: ${url}`);
    const response = await axios.get(url, {
      timeout: 15000,
      responseType: "text",
    });
    
    providerCodeCache.set(provider.id, {
      code: response.data,
      fetchedAt: now,
    });
    
    return response.data;
  } catch (error) {
    console.error(`[Nuvio] Failed to fetch provider ${provider.id}:`, error);
    const cached = providerCodeCache.get(provider.id);
    return cached?.code ?? null;
  }
}

import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const availableModules: Record<string, any> = {
  "cheerio": cheerio,
  "cheerio-without-node-native": cheerio,
  "crypto-js": CryptoJS,
  "axios": axios,
};

function createRequire(providerId: string) {
  return function require(moduleName: string) {
    if (availableModules[moduleName]) {
      return availableModules[moduleName];
    }
    console.warn(`[Provider:${providerId}] Module "${moduleName}" not available`);
    return {};
  };
}

function createSandboxedProvider(code: string, providerId: string): { getStreams: Function } | null {
  try {
    const customConsole = {
      log: (...args: any[]) => (globalThis as any).__providerLog('log', providerId, ...args),
      error: (...args: any[]) => (globalThis as any).__providerLog('error', providerId, ...args),
      warn: (...args: any[]) => (globalThis as any).__providerLog('warn', providerId, ...args),
    };

    const requireFn = createRequire(providerId);

    const sandbox: Record<string, any> = {
      require: requireFn,
      fetch: fetch,
      console: customConsole,
      module: { exports: {} as any },
      exports: {} as any,
      Promise: Promise,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Buffer: Buffer,
      URL: URL,
      URLSearchParams: URLSearchParams,
      TextEncoder: TextEncoder,
      TextDecoder: TextDecoder,
      atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
      btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent,
      encodeURI: encodeURI,
      decodeURI: decodeURI,
      JSON: JSON,
      Math: Math,
      Date: Date,
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      Error: Error,
      TypeError: TypeError,
      ReferenceError: ReferenceError,
      SyntaxError: SyntaxError,
      parseInt: parseInt,
      parseFloat: parseFloat,
      isNaN: isNaN,
      isFinite: isFinite,
      Map: Map,
      Set: Set,
      WeakMap: WeakMap,
      WeakSet: WeakSet,
      Symbol: Symbol,
      Proxy: Proxy,
      Reflect: Reflect,
    };
    
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;

    vm.createContext(sandbox);
    
    const wrappedCode = `
      (function() {
        ${code}
        return module.exports;
      })();
    `;
    
    const result = vm.runInContext(wrappedCode, sandbox, {
      timeout: 30000,
      filename: `provider-${providerId}.js`,
    });
    
    if (typeof result?.getStreams === "function") {
      return result;
    }
    
    console.error(`[Nuvio] Provider ${providerId} does not export getStreams function`);
    return null;
  } catch (error) {
    console.error(`[Nuvio] Failed to create sandboxed provider ${providerId}:`, error);
    return null;
  }
}

(globalThis as any).__providerLog = (level: string, providerId: string, ...args: any[]) => {
  const prefix = `[Provider:${providerId}]`;
  switch (level) {
    case "error":
      console.error(prefix, ...args);
      break;
    case "warn":
      console.warn(prefix, ...args);
      break;
    default:
      console.log(prefix, ...args);
  }
};

export async function getStreamsFromProvider(
  provider: Provider,
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  console.log(`[Nuvio] Getting streams from ${provider.name} for ${mediaType} ${tmdbId}`);
  
  const code = await fetchProviderCode(provider);
  if (!code) {
    console.error(`[Nuvio] No code available for ${provider.id}`);
    return [];
  }

  const sandboxed = createSandboxedProvider(code, provider.id);
  if (!sandboxed) {
    return [];
  }

  try {
    const streams = await Promise.race([
      sandboxed.getStreams(tmdbId, mediaType, season, episode),
      new Promise<Stream[]>((_, reject) => 
        setTimeout(() => reject(new Error("Provider timeout")), 30000)
      ),
    ]);
    
    if (!Array.isArray(streams)) {
      console.log(`[Nuvio] Provider ${provider.id} returned non-array:`, typeof streams);
      return [];
    }

    console.log(`[Nuvio] Provider ${provider.id} returned ${streams.length} streams`);
    
    return streams.map((s: any) => ({
      name: s.name || provider.name,
      title: s.title || "",
      url: s.url || "",
      quality: s.quality || "Unknown",
      size: s.size,
      provider: provider.id,
      headers: s.headers,
    }));
  } catch (error: any) {
    console.error(`[Nuvio] Error getting streams from ${provider.id}:`, error?.message);
    return [];
  }
}

export async function getAllStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  const manifest = await fetchNuvioManifest();
  const nuvioProviders = manifest.scrapers.filter((p) => p.enabled);
  
  const relevantProviders = nuvioProviders.filter((p) => 
    p.supportedTypes.includes(mediaType)
  );
  
  console.log(`[Nuvio] Fetching from ${relevantProviders.length} nuvio-providers for ${mediaType} ${tmdbId}`);

  const nuvioPromises = relevantProviders.map((provider) =>
    getStreamsFromProvider(provider, tmdbId, mediaType, season, episode)
      .catch((error) => {
        console.error(`[Nuvio] Provider ${provider.id} failed:`, error);
        return [] as Stream[];
      })
  );

  const nuvioStreamsPromise = getAllNuvioStreamsProviderStreams(tmdbId, mediaType, season, episode)
    .catch((error) => {
      console.error(`[NuvioStreams] Failed:`, error);
      return [] as Stream[];
    });

  const [nuvioResults, nuvioStreamsResults] = await Promise.all([
    Promise.allSettled(nuvioPromises),
    nuvioStreamsPromise,
  ]);
  
  const allStreams: Stream[] = [];
  for (const result of nuvioResults) {
    if (result.status === "fulfilled") {
      allStreams.push(...result.value);
    }
  }
  allStreams.push(...nuvioStreamsResults);

  console.log(`[Nuvio] Total streams found: ${allStreams.length}`);
  return allStreams;
}
