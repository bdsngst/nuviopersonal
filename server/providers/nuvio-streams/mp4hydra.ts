import axios from "axios";
import type { Stream } from "@shared/schema";
import { TMDB_API_KEY } from "./config";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

interface TMDBDetails {
  title: string;
  original_title: string;
  year: string;
  slug: string;
}

async function getTMDBDetails(
  tmdbId: string,
  mediaType: string
): Promise<TMDBDetails | null> {
  try {
    const endpoint = mediaType === "tv" ? "tv" : "movie";
    const response = await axios.get(
      `https://api.themoviedb.org/3/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}`,
      { timeout: 10000 }
    );

    const data = response.data;
    const title = mediaType === "tv" ? data.name : data.title;
    const originalTitle =
      mediaType === "tv" ? data.original_name : data.original_title;
    const releaseDate =
      mediaType === "tv" ? data.first_air_date : data.release_date;
    const year = releaseDate ? releaseDate.substring(0, 4) : "";

    return {
      title,
      original_title: originalTitle,
      year,
      slug: generateSlug(title),
    };
  } catch (error: any) {
    console.error("[MP4Hydra] Failed to get TMDB details:", error.message);
    return null;
  }
}

interface ProcessedEpisode {
  title: string;
  episode: string;
  quality: string;
  videoUrl: string;
  server: string;
  serverNumber: string;
  subtitles: { label: string; url: string }[];
}

function processEpisode(
  episode: any,
  baseServer: string,
  serverName: string,
  serverNumber: string
): ProcessedEpisode {
  const videoUrl = `${baseServer}${episode.src}`;
  const subtitles = episode.subs
    ? episode.subs.map((sub: any) => ({
        label: sub.label,
        url: `${baseServer}${sub.src}`,
      }))
    : [];

  return {
    title: episode.show_title || episode.title,
    episode: episode.title,
    quality: episode.quality || episode.label || "Unknown",
    videoUrl,
    server: serverName,
    serverNumber,
    subtitles,
  };
}

export async function getMP4HydraStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  seasonNum?: number,
  episodeNum?: number
): Promise<Stream[]> {
  try {
    console.log(
      `[MP4Hydra] Fetching for TMDB ID: ${tmdbId}, Type: ${mediaType}, Season: ${seasonNum}, Episode: ${episodeNum}`
    );

    const details = await getTMDBDetails(tmdbId, mediaType);
    if (!details) {
      console.log(`[MP4Hydra] Could not fetch TMDB details for: ${tmdbId}`);
      return [];
    }

    console.log(`[MP4Hydra] Found title: ${details.title} (${details.year})`);

    let slug = details.slug;
    if (mediaType === "movie" && details.year) {
      slug = `${details.slug}-${details.year}`;
    }
    console.log(`[MP4Hydra] Using slug: ${slug}`);

    const formData = new URLSearchParams();
    formData.append("v", "8");
    formData.append(
      "z",
      JSON.stringify([
        {
          s: slug,
          t: mediaType,
          se: seasonNum || null,
          ep: episodeNum || null,
        },
      ])
    );

    const response = await axios({
      method: "post",
      url: "https://mp4hydra.org/info2?v=8",
      data: formData.toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36",
        Accept: "*/*",
        Origin: "https://mp4hydra.org",
        Referer: `https://mp4hydra.org/${mediaType}/${slug}`,
      },
      timeout: 15000,
    });

    if (
      !response.data ||
      !response.data.playlist ||
      response.data.playlist.length === 0
    ) {
      console.log("[MP4Hydra] No playlist found in response");
      return [];
    }

    const playlist = response.data.playlist;
    const servers = response.data.servers;

    console.log(`[MP4Hydra] Found ${playlist.length} videos`);
    console.log(
      `[MP4Hydra] Available servers: ${Object.keys(servers).join(", ")}`
    );

    const streams: Stream[] = [];
    const serverConfig = [
      { name: "Beta", number: "#1" },
      { name: "Beta#3", number: "#2" },
    ];

    if (mediaType === "tv" && seasonNum && episodeNum) {
      const paddedSeason = String(seasonNum).padStart(2, "0");
      const paddedEpisode = String(episodeNum).padStart(2, "0");
      const seasonEpisode = `S${paddedSeason}E${paddedEpisode}`;

      const targetEpisode = playlist.find(
        (item: any) =>
          item.title &&
          item.title.toUpperCase() === seasonEpisode.toUpperCase()
      );

      if (!targetEpisode) {
        console.log(`[MP4Hydra] Could not find ${seasonEpisode}`);
        return [];
      }

      console.log(
        `[MP4Hydra] Found episode: ${targetEpisode.show_title || targetEpisode.title}`
      );

      serverConfig.forEach((server) => {
        const { name: serverName, number: serverNumber } = server;

        if (servers[serverName]) {
          const baseServer = servers[serverName];
          const processed = processEpisode(
            targetEpisode,
            baseServer,
            serverName,
            serverNumber
          );

          streams.push({
            name: "MP4Hydra",
            title: `${details.title} - ${seasonEpisode} - ${processed.quality} [MP4Hydra ${serverNumber}]`,
            url: processed.videoUrl,
            quality: processed.quality,
            provider: "mp4hydra",
          });
        }
      });
    } else {
      serverConfig.forEach((server) => {
        const { name: serverName, number: serverNumber } = server;

        if (servers[serverName]) {
          const baseServer = servers[serverName];

          playlist.forEach((item: any) => {
            const processed = processEpisode(
              item,
              baseServer,
              serverName,
              serverNumber
            );

            streams.push({
              name: "MP4Hydra",
              title: `${details.title} - ${processed.quality} [MP4Hydra ${serverNumber}]`,
              url: processed.videoUrl,
              quality: processed.quality,
              provider: "mp4hydra",
            });
          });
        }
      });
    }

    console.log(`[MP4Hydra] Found ${streams.length} streams`);
    return streams;
  } catch (error: any) {
    console.error(`[MP4Hydra] Error:`, error.message);
    return [];
  }
}
