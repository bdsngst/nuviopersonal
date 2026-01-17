import axios from "axios";
import * as cheerio from "cheerio";
import type { Stream } from "@shared/schema";

const SOURCE_URL = "https://vidsrc.xyz/embed";
let BASEDOM = "https://cloudnestra.com";

interface ServerInfo {
  name: string;
  dataHash: string | null;
}

async function serversLoad(html: string): Promise<{ servers: ServerInfo[]; title: string }> {
  const $ = cheerio.load(html);
  const servers: ServerInfo[] = [];
  const title = $("title").text() || "";
  const baseFrameSrc = $("iframe").attr("src") || "";

  if (baseFrameSrc) {
    try {
      const fullUrl = baseFrameSrc.startsWith("//")
        ? "https:" + baseFrameSrc
        : baseFrameSrc;
      BASEDOM = new URL(fullUrl).origin;
    } catch (e) {
      const originMatch = (
        baseFrameSrc.startsWith("//") ? "https:" + baseFrameSrc : baseFrameSrc
      ).match(/^(https?:\/\/[^/]+)/);
      if (originMatch && originMatch[1]) {
        BASEDOM = originMatch[1];
      }
    }
  }

  $(".serversList .server").each((_, element) => {
    const server = $(element);
    servers.push({
      name: server.text().trim(),
      dataHash: server.attr("data-hash") || null,
    });
  });

  return { servers, title };
}

interface ParsedStream {
  quality: string;
  url: string;
}

function parseMasterM3U8(m3u8Content: string, masterM3U8Url: string): ParsedStream[] {
  const lines = m3u8Content.split("\n").map((line) => line.trim());
  const streams: ParsedStream[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
      const infoLine = lines[i];
      let quality = "unknown";
      const resolutionMatch = infoLine.match(/RESOLUTION=(\d+x\d+)/);
      if (resolutionMatch && resolutionMatch[1]) {
        quality = resolutionMatch[1];
      } else {
        const bandwidthMatch = infoLine.match(/BANDWIDTH=(\d+)/);
        if (bandwidthMatch && bandwidthMatch[1]) {
          quality = `${Math.round(parseInt(bandwidthMatch[1]) / 1000)}kbps`;
        }
      }

      if (
        i + 1 < lines.length &&
        lines[i + 1] &&
        !lines[i + 1].startsWith("#")
      ) {
        const streamUrlPart = lines[i + 1];
        try {
          const fullStreamUrl = new URL(streamUrlPart, masterM3U8Url).href;
          streams.push({ quality, url: fullStreamUrl });
        } catch {
          streams.push({ quality, url: streamUrlPart });
        }
        i++;
      }
    }
  }

  streams.sort((a, b) => {
    const getHeight = (quality: string) => {
      const match = quality.match(/(\d+)x(\d+)/);
      return match ? parseInt(match[2], 10) : 0;
    };
    return getHeight(b.quality) - getHeight(a.quality);
  });

  return streams;
}

async function PRORCPhandler(prorcp: string): Promise<ParsedStream[] | null> {
  try {
    const prorcpUrl = `${BASEDOM}/prorcp/${prorcp}`;
    const prorcpResponse = await axios.get(prorcpUrl, {
      headers: {
        accept: "*/*",
        "sec-ch-ua": '"Chromium";v="128", "Not;A=Brand";v="24"',
        "sec-fetch-dest": "iframe",
        Referer: `${BASEDOM}/`,
      },
      timeout: 10000,
    });

    const regex = /file:\s*'([^']*)'/gm;
    const match = regex.exec(prorcpResponse.data);
    if (match && match[1]) {
      const masterM3U8Url = match[1];
      const m3u8Response = await axios.get(masterM3U8Url, {
        headers: { Referer: prorcpUrl, Accept: "*/*" },
        timeout: 10000,
      });
      return parseMasterM3U8(m3u8Response.data, masterM3U8Url);
    }
    return null;
  } catch (error: any) {
    console.error(`[VidSrc] Error in PRORCPhandler:`, error.message);
    return null;
  }
}

async function SRCRCPhandler(
  srcrcpPath: string,
  referer: string
): Promise<ParsedStream[] | null> {
  try {
    const srcrcpUrl = BASEDOM + srcrcpPath;
    console.log(`[VidSrc] Fetching SRCRCP: ${srcrcpUrl}`);

    const response = await axios.get(srcrcpUrl, {
      headers: {
        accept: "*/*",
        "sec-fetch-dest": "iframe",
        Referer: referer,
      },
      timeout: 10000,
    });

    const responseText = response.data;

    const fileRegex = /file:\s*'([^']*)'/gm;
    const fileMatch = fileRegex.exec(responseText);
    if (fileMatch && fileMatch[1]) {
      const masterM3U8Url = fileMatch[1];
      const m3u8Response = await axios.get(masterM3U8Url, {
        headers: { Referer: srcrcpUrl, Accept: "*/*" },
        timeout: 10000,
      });
      return parseMasterM3U8(m3u8Response.data, masterM3U8Url);
    }

    if (responseText.trim().startsWith("#EXTM3U")) {
      return parseMasterM3U8(responseText, srcrcpUrl);
    }

    const $ = cheerio.load(responseText);
    let foundUrl: string | null = null;

    $("script").each((_, script) => {
      const scriptContent = $(script).html();
      if (scriptContent && !foundUrl) {
        const m3u8Match = scriptContent.match(
          /['"](https?:\/\/[^'"\s]+\.m3u8[^'"\s]*)['"]/i
        );
        if (m3u8Match && m3u8Match[1]) {
          foundUrl = m3u8Match[1];
        }
      }
    });

    if (foundUrl) {
      const m3u8Response = await axios.get(foundUrl, {
        headers: { Referer: srcrcpUrl, Accept: "*/*" },
        timeout: 10000,
      });
      return parseMasterM3U8(m3u8Response.data, foundUrl);
    }

    return null;
  } catch (error: any) {
    console.error(`[VidSrc] Error in SRCRCPhandler:`, error.message);
    return null;
  }
}

async function rcpGrabber(html: string): Promise<string | null> {
  const regex = /src:\s*'([^']*)'/;
  const match = html.match(regex);
  return match && match[1] ? match[1] : null;
}

function getUrl(id: string, type: string, season?: number, episode?: number): string {
  if (type === "movie") {
    return `${SOURCE_URL}/movie/${id}`;
  }
  return `${SOURCE_URL}/tv/${id}/${season || 1}/${episode || 1}`;
}

export async function getVidSrcStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  seasonNum?: number,
  episodeNum?: number
): Promise<Stream[]> {
  try {
    console.log(
      `[VidSrc] Fetching for TMDB ID: ${tmdbId}, Type: ${mediaType}`
    );

    const embedUrl = getUrl(tmdbId, mediaType, seasonNum, episodeNum);
    console.log(`[VidSrc] Embed URL: ${embedUrl}`);

    const embedResponse = await axios.get(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml",
      },
      timeout: 10000,
    });

    const { servers, title } = await serversLoad(embedResponse.data);
    console.log(`[VidSrc] Found ${servers.length} servers`);

    if (servers.length === 0) {
      console.log("[VidSrc] No servers found");
      return [];
    }

    const allStreams: Stream[] = [];

    for (const server of servers) {
      if (!server.dataHash) continue;

      try {
        const rcpUrl = `${BASEDOM}/rcp/${server.dataHash}`;
        console.log(`[VidSrc] Processing server ${server.name}: ${rcpUrl}`);

        const rcpResponse = await axios.get(rcpUrl, {
          headers: {
            Referer: embedUrl,
          },
          timeout: 10000,
        });

        const rcpData = await rcpGrabber(rcpResponse.data);
        if (!rcpData) continue;

        let parsedStreams: ParsedStream[] | null = null;

        if (rcpData.includes("/prorcp/")) {
          const prorcpId = rcpData.split("/prorcp/")[1];
          parsedStreams = await PRORCPhandler(prorcpId);
        } else if (rcpData.startsWith("/")) {
          parsedStreams = await SRCRCPhandler(rcpData, rcpUrl);
        }

        if (parsedStreams && parsedStreams.length > 0) {
          for (const stream of parsedStreams) {
            const qualityLabel = stream.quality.includes("x")
              ? stream.quality.split("x")[1] + "p"
              : stream.quality;

            allStreams.push({
              name: "VidSrc",
              title: `VidSrc - ${server.name} - ${qualityLabel}`,
              url: stream.url,
              quality: qualityLabel,
              provider: "vidsrc",
            });
          }
        }
      } catch (error: any) {
        console.error(
          `[VidSrc] Error processing server ${server.name}:`,
          error.message
        );
      }
    }

    console.log(`[VidSrc] Found ${allStreams.length} streams`);
    return allStreams;
  } catch (error: any) {
    console.error(`[VidSrc] Error:`, error.message);
    return [];
  }
}
