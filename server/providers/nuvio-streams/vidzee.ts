import axios from "axios";
import type { Stream } from "@shared/schema";

export async function getVidZeeStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  seasonNum?: number,
  episodeNum?: number
): Promise<Stream[]> {
  if (!tmdbId) {
    console.error("[VidZee] Error: TMDB ID is required.");
    return [];
  }

  if (mediaType === "tv" && (!seasonNum || !episodeNum)) {
    console.error("[VidZee] Error: Season and episode are required for TV shows.");
    return [];
  }

  const servers = [3, 4, 5];
  const timeout = 7000;

  const streamPromises = servers.map(async (sr) => {
    let targetApiUrl = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}`;

    if (mediaType === "tv") {
      targetApiUrl += `&ss=${seasonNum}&ep=${episodeNum}`;
    }

    console.log(`[VidZee] Fetching from server ${sr}: ${targetApiUrl}`);

    try {
      const response = await axios.get(targetApiUrl, {
        headers: {
          Referer: "https://core.vidzee.wtf/",
        },
        timeout,
      });

      const responseData = response.data;

      if (!responseData || typeof responseData !== "object") {
        console.error(`[VidZee S${sr}] Error: Invalid response data.`);
        return [];
      }

      let apiSources: any[] = [];
      if (responseData.url && Array.isArray(responseData.url)) {
        apiSources = responseData.url;
      } else if (responseData.link && typeof responseData.link === "string") {
        apiSources = [responseData];
      }

      if (!apiSources || apiSources.length === 0) {
        console.log(`[VidZee S${sr}] No stream sources found.`);
        return [];
      }

      const streams: Stream[] = apiSources
        .map((sourceItem: any) => {
          const label = sourceItem.name || sourceItem.type || "VidZee";
          const quality = String(label).match(/^\d+$/)
            ? `${label}p`
            : String(label);
          const language = sourceItem.language || sourceItem.lang;

          return {
            name: `VidZee S${sr}`,
            title: `VidZee S${sr} - ${quality}${language ? ` [${language}]` : ""}`,
            url: sourceItem.link,
            quality,
            provider: "vidzee",
          };
        })
        .filter((stream: Stream) => stream.url);

      console.log(`[VidZee S${sr}] Extracted ${streams.length} streams.`);
      return streams;
    } catch (error: any) {
      if (error.response) {
        console.error(
          `[VidZee S${sr}] Error: ${error.response.status} ${error.response.statusText}`
        );
      } else {
        console.error(`[VidZee S${sr}] Error:`, error.message);
      }
      return [];
    }
  });

  const allStreamsNested = await Promise.all(streamPromises);
  const allStreams = allStreamsNested.flat();

  console.log(
    `[VidZee] Found ${allStreams.length} streams from servers ${servers.join(", ")}.`
  );
  return allStreams;
}
