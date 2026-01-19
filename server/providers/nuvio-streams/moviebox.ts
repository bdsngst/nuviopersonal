import type { Stream } from "@shared/schema";
import CryptoJS from "crypto-js";
import { getTMDBApiKey } from "./config";

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function searchTmdb(tmdbId: string, mediaType: "movie" | "tv"): Promise<{ title: string; year: string } | null> {
  const apiKey = getTMDBApiKey();
  if (!apiKey) return null;
  
  try {
    const url = `${TMDB_BASE_URL}/${mediaType}/${tmdbId}?api_key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const title = mediaType === 'movie' ? (data.title || data.original_title) : (data.name || data.original_name);
    const year = (data.release_date || data.first_air_date || '').substring(0, 4);
    
    return { title, year };
  } catch (error) {
    console.error("[MovieBox] TMDB lookup failed:", error);
    return null;
  }
}

const HEADERS = {
  'User-Agent': 'com.community.mbox.in/50020042 (Linux; U; Android 16; en_IN; sdk_gphone64_x86_64; Build/BP22.250325.006; Cronet/133.0.6876.3)',
  'Connection': 'keep-alive',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'x-client-info': '{"package_name":"com.community.mbox.in","version_name":"3.0.03.0529.03","version_code":50020042,"os":"android","os_version":"16","device_id":"da2b99c821e6ea023e4be55b54d5f7d8","install_store":"ps","gaid":"d7578036d13336cc","brand":"google","model":"sdk_gphone64_x86_64","system_language":"en","net":"NETWORK_WIFI","region":"IN","timezone":"Asia/Calcutta","sp_code":""}',
  'x-client-status': '0'
};

const API_BASE = "https://api.inmoviebox.com";

const KEY_B64_DEFAULT = "NzZpUmwwN3MweFNOOWpxbUVXQXQ3OUVCSlp1bElRSXNWNjRGWnIyTw==";
const KEY_B64_ALT = "WHFuMm5uTzQxL0w5Mm8xaXVYaFNMSFRiWHZZNFo1Wlo2Mm04bVNMQQ==";

const SECRET_KEY_DEFAULT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_DEFAULT).toString(CryptoJS.enc.Utf8)
);
const SECRET_KEY_ALT = CryptoJS.enc.Base64.parse(
  CryptoJS.enc.Base64.parse(KEY_B64_ALT).toString(CryptoJS.enc.Utf8)
);

function md5(input: string | CryptoJS.lib.WordArray): string {
  return CryptoJS.MD5(input).toString(CryptoJS.enc.Hex);
}

function hmacMd5(key: CryptoJS.lib.WordArray, data: string): string {
  return CryptoJS.HmacMD5(data, key).toString(CryptoJS.enc.Base64);
}

function generateXClientToken(timestamp: number): string {
  const ts = timestamp.toString();
  const reversed = ts.split('').reverse().join('');
  const hash = md5(reversed);
  return `${ts},${hash}`;
}

function buildCanonicalString(
  method: string,
  accept: string,
  contentType: string,
  url: string,
  body: string | null,
  timestamp: number
): string {
  let path = "";
  let query = "";

  try {
    const urlObj = new URL(url);
    path = urlObj.pathname;
    const params = Array.from(urlObj.searchParams.keys()).sort();
    if (params.length > 0) {
      query = params.map(key => {
        const values = urlObj.searchParams.getAll(key);
        return values.map(val => `${key}=${val}`).join('&');
      }).join('&');
    }
  } catch (e) {
    console.error("[MovieBox] Invalid URL for canonical:", url);
  }

  const canonicalUrl = query ? `${path}?${query}` : path;

  let bodyHash = "";
  let bodyLength = "";

  if (body) {
    const bodyWords = CryptoJS.enc.Utf8.parse(body);
    bodyHash = md5(bodyWords);
    bodyLength = bodyWords.sigBytes.toString();
  }

  return `${method.toUpperCase()}\n` +
    `${accept || ""}\n` +
    `${contentType || ""}\n` +
    `${bodyLength}\n` +
    `${timestamp}\n` +
    `${bodyHash}\n` +
    canonicalUrl;
}

function generateXTrSignature(
  method: string,
  accept: string,
  contentType: string,
  url: string,
  body: string | null,
  useAltKey = false,
  customTimestamp: number | null = null
): string {
  const timestamp = customTimestamp || Date.now();
  const canonical = buildCanonicalString(method, accept, contentType, url, body, timestamp);
  const secret = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
  const signatureB64 = hmacMd5(secret, canonical);
  return `${timestamp}|2|${signatureB64}`;
}

async function movieBoxRequest(method: string, url: string, body: string | null = null): Promise<any> {
  const timestamp = Date.now();
  const xClientToken = generateXClientToken(timestamp);
  const accept = 'application/json';
  const contentType = 'application/json';

  const xTrSignature = generateXTrSignature(method, accept, contentType, url, body, false, timestamp);

  const headers: Record<string, string> = {
    'Accept': accept,
    'Content-Type': contentType,
    'x-client-token': xClientToken,
    'x-tr-signature': xTrSignature,
    'User-Agent': HEADERS['User-Agent'],
    'x-client-info': HEADERS['x-client-info'],
    'x-client-status': HEADERS['x-client-status'],
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body) {
    options.body = body;
  }

  try {
    const response = await fetch(url, options);
    const text = await response.text();
    if (!response.ok) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return text;
    }
  } catch (err) {
    console.error("[MovieBox] Request error:", err);
    return null;
  }
}

function normalizeTitle(s: string): string {
  if (!s) return "";
  return s.replace(/\[.*?\]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(dub|dubbed|hd|4k|hindi|tamil|telugu|dual audio)\b/gi, " ")
    .trim()
    .toLowerCase()
    .replace(/:/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

interface MovieBoxSubject {
  subjectId: number;
  title: string;
  subjectType: number;
  year?: string;
  releaseDate?: string;
}

async function searchMovieBox(query: string): Promise<MovieBoxSubject[]> {
  const url = `${API_BASE}/wefeed-mobile-bff/subject-api/search/v2`;
  const body = JSON.stringify({ page: 1, perPage: 10, keyword: query });

  console.log(`[MovieBox] API Request: POST ${url}`);
  console.log(`[MovieBox] Body: ${body}`);

  const res = await movieBoxRequest('POST', url, body);
  
  if (!res) {
    console.log(`[MovieBox] API returned null response`);
    return [];
  }

  console.log(`[MovieBox] API Response code: ${res.code}, has data: ${!!res.data}`);

  if (res && res.data && res.data.results) {
    let allSubjects: MovieBoxSubject[] = [];
    res.data.results.forEach((group: any) => {
      if (group.subjects) {
        allSubjects = allSubjects.concat(group.subjects);
      }
    });
    console.log(`[MovieBox] Found ${allSubjects.length} subjects from search`);
    return allSubjects;
  }
  return [];
}

function findBestMatch(
  subjects: MovieBoxSubject[],
  tmdbTitle: string,
  tmdbYear: string,
  mediaType: string
): MovieBoxSubject | null {
  const normTmdbTitle = normalizeTitle(tmdbTitle);
  const targetType = mediaType === 'movie' ? 1 : 2;

  let bestMatch: MovieBoxSubject | null = null;
  let bestScore = 0;

  console.log(`[MovieBox] Matching against ${subjects.length} subjects for type ${targetType}`);

  for (const subject of subjects) {
    const title = subject.title;
    const normTitle = normalizeTitle(title);
    const year = subject.year || (subject.releaseDate ? subject.releaseDate.substring(0, 4) : null);

    let score = 0;

    if (normTitle === normTmdbTitle) score += 50;
    else if (normTitle.includes(normTmdbTitle) || normTmdbTitle.includes(normTitle)) score += 25;

    if (tmdbYear && year && tmdbYear === year) score += 35;
    else if (tmdbYear && year && Math.abs(parseInt(tmdbYear) - parseInt(year)) <= 1) score += 20;

    if (subject.subjectType === targetType) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = subject;
      console.log(`[MovieBox] Candidate: "${title}" (type: ${subject.subjectType}, year: ${year}, score: ${score})`);
    }
  }

  if (bestScore >= 30) {
    console.log(`[MovieBox] Best match: "${bestMatch?.title}" with score ${bestScore}`);
    return bestMatch;
  }
  
  console.log(`[MovieBox] No match found with score >= 30 (best was ${bestScore})`);
  return null;
}

function parseQualityNumber(value: string | number): number {
  const match = String(value || '').match(/(\d{3,4})/);
  return match ? parseInt(match[1], 10) : 0;
}

function formatQualityLabel(value: string | number): string {
  if (!value) return 'Auto';
  const s = String(value).trim();
  if (/\d{3,4}p$/i.test(s)) return s;
  const n = parseQualityNumber(s);
  return n ? `${n}p` : s;
}

function getFormatType(url: string): string {
  const u = String(url || '').toLowerCase();
  if (u.includes('.mpd')) return 'DASH';
  if (u.includes('.m3u8')) return 'HLS';
  if (u.includes('.mp4')) return 'MP4';
  if (u.includes('.mkv')) return 'MKV';
  return 'VIDEO';
}

function urlTypeRank(url: string): number {
  const u = String(url || '').toLowerCase();
  if (u.includes('.mpd')) return 3;
  if (u.includes('.m3u8')) return 2;
  if (u.includes('.mp4') || u.includes('.mkv')) return 1;
  return 0;
}

async function getStreamLinks(
  subjectId: number,
  season: number,
  episode: number,
  mediaTitle: string,
  mediaType: string
): Promise<Stream[]> {
  const subjectUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/get?subjectId=${subjectId}`;
  const subjectRes = await movieBoxRequest('GET', subjectUrl);

  if (!subjectRes || !subjectRes.data) return [];

  const subjectIds: { id: number; lang: string }[] = [];
  let originalLang = "Original";

  const dubs = subjectRes.data.dubs;
  if (Array.isArray(dubs)) {
    dubs.forEach((dub: any) => {
      if (dub.subjectId == subjectId) {
        originalLang = dub.lanName || "Original";
      } else {
        subjectIds.push({ id: dub.subjectId, lang: dub.lanName });
      }
    });
  }

  subjectIds.unshift({ id: subjectId, lang: originalLang });

  const allStreams: Stream[] = [];

  for (const item of subjectIds) {
    const playUrl = `${API_BASE}/wefeed-mobile-bff/subject-api/play-info?subjectId=${item.id}&se=${season}&ep=${episode}`;
    const playRes = await movieBoxRequest('GET', playUrl);

    if (playRes && playRes.data && playRes.data.streams) {
      for (const stream of playRes.data.streams) {
        if (stream.url) {
          const qualityField = stream.resolutions || stream.quality || 'Auto';
          let candidates: string[] = [];

          if (Array.isArray(qualityField)) {
            candidates = qualityField;
          } else if (typeof qualityField === 'string' && qualityField.includes(',')) {
            candidates = qualityField.split(',').map((s: string) => s.trim()).filter(Boolean);
          } else {
            candidates = [String(qualityField)];
          }

          const maxQ = candidates.reduce((m, v) => Math.max(m, parseQualityNumber(v)), 0);
          const quality = maxQ ? `${maxQ}p` : formatQualityLabel(candidates[0]);
          const formatType = getFormatType(stream.url);

          let title = mediaTitle || 'Stream';
          if (mediaType === 'tv' && season > 0 && episode > 0) {
            title = `${mediaTitle} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
          }

          allStreams.push({
            name: `MovieBox (${item.lang}) ${quality} [${formatType}]`,
            title,
            url: stream.url,
            quality,
            provider: 'moviebox',
            headers: {
              "Referer": API_BASE,
              "User-Agent": HEADERS['User-Agent'],
              ...(stream.signCookie ? { "Cookie": stream.signCookie } : {}),
            },
          });
        }
      }
    }
  }

  allStreams.sort((a, b) => {
    const qa = parseQualityNumber(a.quality || '');
    const qb = parseQualityNumber(b.quality || '');
    if (qb !== qa) return qb - qa;
    return urlTypeRank(b.url) - urlTypeRank(a.url);
  });

  return allStreams;
}

export async function getStreams(
  tmdbId: string,
  mediaType: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<Stream[]> {
  console.log(`[MovieBox] Fetching streams for ${mediaType} ${tmdbId}`);

  try {
    const searchResult = await searchTmdb(tmdbId, mediaType);
    if (!searchResult) {
      console.log(`[MovieBox] No TMDB details found for ${tmdbId}`);
      return [];
    }

    const { title, year } = searchResult;
    console.log(`[MovieBox] Searching for: ${title} (${year})`);

    let subjects = await searchMovieBox(title);
    let bestMatch = findBestMatch(subjects, title, year, mediaType);

    if (!bestMatch) {
      console.log(`[MovieBox] No match found for ${title}`);
      return [];
    }

    console.log(`[MovieBox] Found match: ${bestMatch.title} (ID: ${bestMatch.subjectId})`);

    const s = mediaType === 'tv' ? (season || 1) : 0;
    const e = mediaType === 'tv' ? (episode || 1) : 0;

    const streams = await getStreamLinks(bestMatch.subjectId, s, e, title, mediaType);
    console.log(`[MovieBox] Found ${streams.length} streams`);
    return streams;
  } catch (error) {
    console.error(`[MovieBox] Error:`, error);
    return [];
  }
}
