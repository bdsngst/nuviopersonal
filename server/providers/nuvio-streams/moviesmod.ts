import axios from "axios";
import * as cheerio from "cheerio";
import type { Stream } from "@shared/schema";
import { TMDB_API_KEY } from "./config";

const BASE_URL = "https://moviesmod.build";

interface MediaInfo {
  title: string;
  year: number | undefined;
}

async function getMediaInfo(tmdbId: string, mediaType: "movie" | "tv"): Promise<MediaInfo | null> {
  if (!TMDB_API_KEY) {
    console.log("[MoviesMod] No TMDB API key, cannot fetch media info");
    return null;
  }

  try {
    const endpoint = mediaType === "movie" ? "movie" : "tv";
    const response = await axios.get(
      `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`,
      { timeout: 10000 }
    );

    const data = response.data;
    const title = mediaType === "movie" ? data.title : data.name;
    const dateField = mediaType === "movie" ? data.release_date : data.first_air_date;
    const year = dateField ? new Date(dateField).getFullYear() : undefined;

    return { title, year };
  } catch (error: any) {
    console.error("[MoviesMod] TMDB fetch error:", error.message);
    return null;
  }
}

function extractQuality(text: string): string {
  if (!text) return "Unknown";
  const qualityMatch = text.match(/(480p|720p|1080p|2160p|4k)/i);
  if (qualityMatch) {
    const q = qualityMatch[1].toLowerCase();
    if (q === "4k") return "2160p";
    return q;
  }
  return "Unknown";
}

async function searchMoviesMod(query: string, year?: number): Promise<string | null> {
  try {
    const searchUrl = `${BASE_URL}/?s=${encodeURIComponent(query.replace(/\s+/g, "+"))}`;
    console.log(`[MoviesMod] Searching: ${searchUrl}`);

    const response = await axios.get(searchUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    const $ = cheerio.load(response.data);
    const results: { url: string; title: string }[] = [];

    $("a[href*='/download-']").each((_, el) => {
      const url = $(el).attr("href");
      const title = $(el).text().trim() || url || "";
      if (url && url.includes(BASE_URL) && !results.find(r => r.url === url)) {
        results.push({ url, title });
      }
    });

    console.log(`[MoviesMod] Found ${results.length} search results`);

    if (results.length === 0) {
      return null;
    }

    const queryLower = query.toLowerCase();
    const yearStr = year ? year.toString() : "";

    for (const result of results) {
      const urlLower = result.url.toLowerCase();
      if (yearStr && urlLower.includes(yearStr)) {
        const titleWords = queryLower.split(" ");
        const matchesTitle = titleWords.every(word => urlLower.includes(word.replace(/[^a-z0-9]/g, "")));
        if (matchesTitle) {
          console.log(`[MoviesMod] Best match: ${result.url}`);
          return result.url;
        }
      }
    }

    return results[0].url;
  } catch (error: any) {
    console.error(`[MoviesMod] Search error: ${error.message}`);
    return null;
  }
}

async function extractDownloadLinks(pageUrl: string): Promise<Stream[]> {
  const streams: Stream[] = [];

  try {
    const response = await axios.get(pageUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    const $ = cheerio.load(response.data);
    const html = response.data;

    const linkPatterns = [
      /href="(https?:\/\/links\.modpro\.blog\/[^"]+)"/g,
      /href="(https?:\/\/posts\.modpro\.blog\/[^"]+)"/g,
      /href="(https?:\/\/[^"]*hubcloud[^"]+)"/g,
      /href="(https?:\/\/[^"]*gdflix[^"]+)"/g,
      /href="(https?:\/\/[^"]*filepress[^"]+)"/g,
      /href="(https?:\/\/[^"]*gdtot[^"]+)"/g,
    ];

    const foundUrls = new Set<string>();
    
    for (const pattern of linkPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        foundUrls.add(match[1]);
      }
    }

    let qualityIndex = 0;
    const qualities = ["1080p", "720p", "480p"];
    
    for (const url of foundUrls) {
      const quality = qualities[qualityIndex % qualities.length] || "Unknown";
      qualityIndex++;
      
      streams.push({
        name: `MoviesMod\n${quality}`,
        title: `MoviesMod Download Link ${qualityIndex}`,
        url: url,
        quality: quality,
        provider: "moviesmod-native",
      });
    }

    $("a[href]").each((_, el) => {
      const url = $(el).attr("href") || "";
      const text = $(el).text().trim();

      if (
        (url.includes(".mkv") || url.includes(".mp4")) &&
        !streams.find((s) => s.url === url)
      ) {
        const quality = extractQuality(text || url);
        streams.push({
          name: `MoviesMod\n${quality}`,
          title: `MoviesMod Direct - ${text || "Download"}`,
          url: url,
          quality: quality,
          provider: "moviesmod-native",
        });
      }
    });

    console.log(`[MoviesMod] Extracted ${streams.length} download links`);
  } catch (error: any) {
    console.error(`[MoviesMod] Extract error: ${error.message}`);
  }

  return streams;
}

export async function getMoviesModStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  console.log(`[MoviesMod-Native] Fetching for TMDB ID: ${tmdbId}, Type: ${mediaType}`);

  const mediaInfo = await getMediaInfo(tmdbId, mediaType);
  if (!mediaInfo) {
    console.log("[MoviesMod-Native] Could not get media info");
    return [];
  }

  console.log(`[MoviesMod-Native] Found: "${mediaInfo.title}" (${mediaInfo.year})`);

  const pageUrl = await searchMoviesMod(mediaInfo.title, mediaInfo.year);
  if (!pageUrl) {
    console.log("[MoviesMod-Native] No search results");
    return [];
  }

  const streams = await extractDownloadLinks(pageUrl);
  console.log(`[MoviesMod-Native] Found ${streams.length} streams`);

  return streams;
}
