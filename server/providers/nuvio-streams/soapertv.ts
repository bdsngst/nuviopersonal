import axios from "axios";
import * as cheerio from "cheerio";
import type { Stream } from "@shared/schema";
import { TMDB_API_KEY } from "./config";

const BASE_URL = "https://soaper.cc";

interface MediaInfo {
  title: string;
  year: number | undefined;
}

interface SearchResult {
  title: string;
  year: number | undefined;
  url: string;
}

interface EpisodeLink {
  num: number;
  url: string;
}

const cache: {
  search: Map<string, { data: SearchResult[]; timestamp: number }>;
  episodes: Map<string, { data: EpisodeLink[]; timestamp: number }>;
} = {
  search: new Map(),
  episodes: new Map(),
};
const CACHE_TTL = 30 * 60 * 1000;

function getFromCache<T>(
  cacheMap: Map<string, { data: T; timestamp: number }>,
  key: string
): T | null {
  const entry = cacheMap.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cacheMap.delete(key);
  return null;
}

function saveToCache<T>(
  cacheMap: Map<string, { data: T; timestamp: number }>,
  key: string,
  data: T
): void {
  cacheMap.set(key, { data, timestamp: Date.now() });
}

function compareMedia(
  media: MediaInfo,
  title: string,
  year: number | undefined
): boolean {
  const normalize = (str: string) =>
    String(str || "")
      .toLowerCase()
      .replace(/[^a-zA-Z0-9]/g, "");

  if (normalize(media.title) !== normalize(title)) {
    return false;
  }

  if (year && media.year && media.year !== year) {
    return false;
  }

  return true;
}

export async function getSoaperTvStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  console.log(
    `[SoaperTV] Fetching for TMDB ID: ${tmdbId}, Type: ${mediaType}${mediaType === "tv" ? `, S${season}E${episode}` : ""}`
  );

  try {
    const tmdbUrl =
      mediaType === "movie"
        ? `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
        : `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`;

    const tmdbResponse = await axios.get(tmdbUrl, { timeout: 10000 });
    const tmdbData = tmdbResponse.data;

    const mediaInfo: MediaInfo = {
      title: mediaType === "movie" ? tmdbData.title : tmdbData.name,
      year: parseInt(
        mediaType === "movie"
          ? (tmdbData.release_date || "").split("-")[0]
          : (tmdbData.first_air_date || "").split("-")[0],
        10
      ),
    };

    if (!mediaInfo.title) {
      console.error("[SoaperTV] Failed to get title from TMDB");
      return [];
    }

    console.log(
      `[SoaperTV] TMDB Info: "${mediaInfo.title}" (${mediaInfo.year || "N/A"})`
    );

    const searchCacheKey = mediaInfo.title.toLowerCase();
    let searchResults = getFromCache(cache.search, searchCacheKey);

    if (!searchResults) {
      const searchUrl = `${BASE_URL}/search.html?keyword=${encodeURIComponent(mediaInfo.title)}`;
      const searchResponse = await axios.get(searchUrl, { timeout: 10000 });
      const $ = cheerio.load(searchResponse.data);

      searchResults = [];
      $(".thumbnail").each((_, element) => {
        const title = $(element).find("h5 a").first().text().trim();
        const yearText = $(element).find(".img-tip").first().text().trim();
        const url = $(element).find("h5 a").first().attr("href");

        if (title && url) {
          searchResults!.push({
            title,
            year: yearText ? parseInt(yearText, 10) : undefined,
            url,
          });
        }
      });

      saveToCache(cache.search, searchCacheKey, searchResults);
    }

    console.log(
      `[SoaperTV] Found ${searchResults.length} search results for "${mediaInfo.title}"`
    );

    const matchingResult = searchResults.find((x) =>
      compareMedia(mediaInfo, x.title, x.year)
    );

    if (!matchingResult) {
      console.log(`[SoaperTV] No matching content found for "${mediaInfo.title}"`);
      return [];
    }

    console.log(
      `[SoaperTV] Found match: "${matchingResult.title}" (${matchingResult.year || "N/A"}) at ${matchingResult.url}`
    );

    let contentUrl = matchingResult.url;

    if (mediaType === "tv" && season && episode) {
      console.log(`[SoaperTV] Finding Season ${season}, Episode ${episode}`);

      const episodeCacheKey = `${contentUrl}-s${season}`.toLowerCase();
      let episodeLinks = getFromCache(cache.episodes, episodeCacheKey);

      if (!episodeLinks) {
        const showPageResponse = await axios.get(`${BASE_URL}${contentUrl}`, {
          timeout: 10000,
        });
        const $ = cheerio.load(showPageResponse.data);

        const seasonBlock = $("h4")
          .filter(
            (_, el) =>
              $(el)
                .text()
                .trim()
                .split(":")[0]
                .trim()
                .toLowerCase() === `season${season}`
          )
          .parent();

        if (seasonBlock.length === 0) {
          console.log(`[SoaperTV] Season ${season} not found`);
          return [];
        }

        episodeLinks = [];
        seasonBlock.find("a").each((_, el) => {
          const episodeNumText = $(el).text().split(".")[0];
          const episodeUrl = $(el).attr("href");
          if (episodeNumText && episodeUrl) {
            episodeLinks!.push({
              num: parseInt(episodeNumText, 10),
              url: episodeUrl,
            });
          }
        });

        saveToCache(cache.episodes, episodeCacheKey, episodeLinks);
      }

      const targetEpisode = episodeLinks.find((ep) => ep.num === episode);

      if (!targetEpisode) {
        console.log(
          `[SoaperTV] Episode ${episode} not found in Season ${season}`
        );
        return [];
      }

      contentUrl = targetEpisode.url;
      console.log(`[SoaperTV] Found episode page: ${contentUrl}`);
    }

    const contentPageResponse = await axios.get(`${BASE_URL}${contentUrl}`, {
      timeout: 10000,
    });
    const $ = cheerio.load(contentPageResponse.data);
    const pass = $("#hId").attr("value");

    if (!pass) {
      console.error("[SoaperTV] Could not find pass value on content page");
      return [];
    }

    console.log(`[SoaperTV] Found pass value: ${pass}`);

    const infoEndpoint =
      mediaType === "tv"
        ? "/home/index/getEInfoAjax"
        : "/home/index/getMInfoAjax";

    const formData = new URLSearchParams();
    formData.append("pass", pass);
    formData.append("e2", "0");
    formData.append("server", "0");

    const streamInfoResponse = await axios.post(
      `${BASE_URL}${infoEndpoint}`,
      formData.toString(),
      {
        headers: {
          Referer: `${BASE_URL}${contentUrl}`,
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        timeout: 10000,
      }
    );

    let streamInfo = streamInfoResponse.data;
    if (typeof streamInfo === "string") {
      try {
        streamInfo = JSON.parse(streamInfo);
      } catch {
        console.error("[SoaperTV] Failed to parse stream info JSON");
        return [];
      }
    }

    if (!streamInfo || !streamInfo.val || typeof streamInfo.val !== "string") {
      console.error("[SoaperTV] No valid stream URL found in response");
      return [];
    }

    const streamPath = streamInfo.val;
    const finalStreamUrl = streamPath.startsWith("http")
      ? streamPath
      : streamPath.startsWith("/")
        ? `${BASE_URL}${streamPath}`
        : `${BASE_URL}/${streamPath}`;

    console.log(`[SoaperTV] Found stream source: ${finalStreamUrl}`);

    const titleSuffix =
      mediaType === "tv" && season && episode
        ? ` S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`
        : "";

    return [
      {
        name: "SoaperTV",
        title: `${mediaInfo.title}${titleSuffix} - SoaperTV`,
        url: finalStreamUrl,
        quality: "Auto",
        provider: "soapertv",
      },
    ];
  } catch (error: any) {
    console.error(`[SoaperTV] Error:`, error.message);
    return [];
  }
}
