import type { Manifest, StremioStream } from "@shared/schema";
import { getEnabledProviders, getAllStreams } from "./providers";

export function getStremioManifest(baseUrl: string): Manifest {
  return {
    id: "com.nuvio.stremio",
    version: "1.0.0",
    name: "Nuvio",
    description: "Stream movies and TV shows from multiple providers - VixSrc, Vidlink, ShowBox, and more",
    logo: `${baseUrl}/logo.png`,
    resources: ["stream"],
    types: ["movie", "series"],
    catalogs: [],
    idPrefixes: ["tt"],
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
    },
  };
}

function qualityToNumber(quality: string): number {
  const q = quality.toLowerCase();
  if (q.includes("4k") || q.includes("2160")) return 2160;
  if (q.includes("1440")) return 1440;
  if (q.includes("1080")) return 1080;
  if (q.includes("720")) return 720;
  if (q.includes("480")) return 480;
  if (q.includes("360")) return 360;
  if (q.includes("240")) return 240;
  if (q === "auto") return 1000;
  if (q === "original") return 2200;
  return 500;
}

export async function getStreamsForContent(
  type: string,
  id: string
): Promise<{ streams: StremioStream[] }> {
  console.log(`[Stremio] Getting streams for ${type} ${id}`);
  
  let imdbId = id;
  let season: number | undefined;
  let episode: number | undefined;

  if (id.includes(":")) {
    const parts = id.split(":");
    imdbId = parts[0];
    if (parts.length >= 3) {
      season = parseInt(parts[1], 10);
      episode = parseInt(parts[2], 10);
    }
  }

  const tmdbId = await imdbToTmdb(imdbId, type === "series" ? "tv" : "movie");
  
  if (!tmdbId) {
    console.log(`[Stremio] Could not find TMDB ID for ${imdbId}`);
    return { streams: [] };
  }

  console.log(`[Stremio] Resolved IMDB ${imdbId} to TMDB ${tmdbId}`);

  const mediaType = type === "series" ? "tv" : "movie";
  const nuvioStreams = await getAllStreams(tmdbId, mediaType, season, episode);

  nuvioStreams.sort((a, b) => qualityToNumber(b.quality) - qualityToNumber(a.quality));

  const stremioStreams: StremioStream[] = nuvioStreams
    .filter((s) => s.url && s.url.startsWith("http"))
    .map((stream) => ({
      name: `${stream.name}\n${stream.quality}`,
      title: stream.size ? `${stream.title}\n${stream.size}` : stream.title,
      url: stream.url,
      behaviorHints: stream.headers ? {
        notWebReady: true,
        proxyHeaders: {
          request: stream.headers,
        },
      } : undefined,
    }));

  console.log(`[Stremio] Returning ${stremioStreams.length} streams`);
  return { streams: stremioStreams };
}

const TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
const tmdbCache = new Map<string, { id: string; fetchedAt: number }>();
const TMDB_CACHE_TTL = 24 * 60 * 60 * 1000;

async function imdbToTmdb(imdbId: string, type: "movie" | "tv"): Promise<string | null> {
  const cacheKey = `${type}:${imdbId}`;
  const cached = tmdbCache.get(cacheKey);
  const now = Date.now();
  
  if (cached && now - cached.fetchedAt < TMDB_CACHE_TTL) {
    return cached.id;
  }

  try {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const response = await fetch(url);
    const data = await response.json();
    
    let tmdbId: string | null = null;
    
    if (type === "movie" && data.movie_results?.length > 0) {
      tmdbId = String(data.movie_results[0].id);
    } else if (type === "tv" && data.tv_results?.length > 0) {
      tmdbId = String(data.tv_results[0].id);
    }
    
    if (tmdbId) {
      tmdbCache.set(cacheKey, { id: tmdbId, fetchedAt: now });
    }
    
    return tmdbId;
  } catch (error) {
    console.error(`[TMDB] Failed to convert ${imdbId} to TMDB:`, error);
    return null;
  }
}

export async function getAddonInfo(baseUrl: string) {
  const providers = await getEnabledProviders();
  const manifest = getStremioManifest(baseUrl);
  
  const installUrl = `stremio://${baseUrl.replace(/^https?:\/\//, "")}/manifest.json`;
  
  return {
    manifest,
    providers,
    installUrl,
  };
}
