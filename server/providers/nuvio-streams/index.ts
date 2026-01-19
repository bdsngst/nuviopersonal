import type { Stream, Provider } from "@shared/schema";
import { getVidZeeStreams } from "./vidzee";
import { getMP4HydraStreams } from "./mp4hydra";
import { getSoaperTvStreams } from "./soapertv";
import { getVidSrcStreams } from "./vidsrc";
import { getMoviesModStreams } from "./moviesmod";
import { getStreams as getMovieBoxStreams } from "./moviebox";

export interface NuvioStreamsProvider {
  id: string;
  name: string;
  description: string;
  supportedTypes: ("movie" | "tv")[];
  enabled: boolean;
  logo?: string;
  getStreams: (
    tmdbId: string,
    mediaType: "movie" | "tv",
    season?: number,
    episode?: number
  ) => Promise<Stream[]>;
}

export const nuvioStreamsProviders: NuvioStreamsProvider[] = [
  {
    id: "vidzee",
    name: "VidZee",
    description: "VidZee streaming with multiple servers",
    supportedTypes: ["movie", "tv"],
    enabled: true,
    logo: "https://vidzee.wtf/favicon.ico",
    getStreams: getVidZeeStreams,
  },
  {
    id: "mp4hydra",
    name: "MP4Hydra",
    description: "MP4Hydra streaming with auto quality selection",
    supportedTypes: ["movie", "tv"],
    enabled: true,
    logo: "https://mp4hydra.org/favicon.ico",
    getStreams: getMP4HydraStreams,
  },
  {
    id: "soapertv",
    name: "SoaperTV",
    description: "SoaperTV streaming for movies and TV shows",
    supportedTypes: ["movie", "tv"],
    enabled: true,
    logo: "https://soaper.cc/favicon.ico",
    getStreams: getSoaperTvStreams,
  },
  {
    id: "vidsrc-extractor",
    name: "VidSrc",
    description: "VidSrc extractor with multiple quality options",
    supportedTypes: ["movie", "tv"],
    enabled: true,
    logo: "https://vidsrc.xyz/favicon.ico",
    getStreams: getVidSrcStreams,
  },
  {
    id: "moviesmod-native",
    name: "MoviesMod",
    description: "MoviesMod streaming with updated domain (moviesmod.build)",
    supportedTypes: ["movie", "tv"],
    enabled: true,
    logo: "https://moviesmod.build/favicon.ico",
    getStreams: getMoviesModStreams,
  },
  {
    id: "moviebox",
    name: "MovieBox",
    description: "MovieBox streaming with multiple languages and qualities (API auth issue)",
    supportedTypes: ["movie", "tv"],
    enabled: false,
    logo: "https://api.inmoviebox.com/favicon.ico",
    getStreams: getMovieBoxStreams,
  },
];

export function getNuvioStreamsProvider(id: string): NuvioStreamsProvider | undefined {
  return nuvioStreamsProviders.find((p) => p.id === id);
}

export function getEnabledNuvioStreamsProviders(): NuvioStreamsProvider[] {
  return nuvioStreamsProviders.filter((p) => p.enabled);
}

export async function getStreamsFromNuvioStreamsProvider(
  provider: NuvioStreamsProvider,
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  if (!provider.supportedTypes.includes(mediaType)) {
    return [];
  }

  try {
    console.log(`[NuvioStreams] Getting streams from ${provider.name} for ${mediaType} ${tmdbId}`);
    const streams = await Promise.race([
      provider.getStreams(tmdbId, mediaType, season, episode),
      new Promise<Stream[]>((_, reject) =>
        setTimeout(() => reject(new Error("Provider timeout")), 30000)
      ),
    ]);

    if (!Array.isArray(streams)) {
      console.log(`[NuvioStreams] Provider ${provider.id} returned non-array`);
      return [];
    }

    console.log(`[NuvioStreams] Provider ${provider.id} returned ${streams.length} streams`);
    return streams;
  } catch (error: any) {
    console.error(`[NuvioStreams] Error from ${provider.id}:`, error.message);
    return [];
  }
}

export async function getAllNuvioStreamsProviderStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  const providers = getEnabledNuvioStreamsProviders().filter((p) =>
    p.supportedTypes.includes(mediaType)
  );

  console.log(`[NuvioStreams] Fetching from ${providers.length} NuvioStreams providers`);

  const streamPromises = providers.map((provider) =>
    getStreamsFromNuvioStreamsProvider(provider, tmdbId, mediaType, season, episode).catch(
      (error) => {
        console.error(`[NuvioStreams] Provider ${provider.id} failed:`, error);
        return [] as Stream[];
      }
    )
  );

  const results = await Promise.allSettled(streamPromises);

  const allStreams: Stream[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allStreams.push(...result.value);
    }
  }

  console.log(`[NuvioStreams] Total NuvioStreams streams: ${allStreams.length}`);
  return allStreams;
}

const providerFilenames: Record<string, string> = {
  vidzee: "server/providers/nuvio-streams/vidzee.ts",
  mp4hydra: "server/providers/nuvio-streams/mp4hydra.ts",
  soapertv: "server/providers/nuvio-streams/soapertv.ts",
  "vidsrc-extractor": "server/providers/nuvio-streams/vidsrc.ts",
  "moviesmod-native": "server/providers/nuvio-streams/moviesmod.ts",
  "moviebox": "server/providers/nuvio-streams/moviebox.ts",
};

export function getNuvioStreamsAsProviderList(): Provider[] {
  return nuvioStreamsProviders.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    version: "1.0.0",
    author: "NuvioStreams",
    supportedTypes: p.supportedTypes,
    filename: providerFilenames[p.id] || `server/providers/nuvio-streams/${p.id}.ts`,
    enabled: p.enabled,
    logo: p.logo,
  }));
}
