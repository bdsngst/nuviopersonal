export function getTMDBApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    console.error("[NuvioStreams] TMDB_API_KEY not set - providers requiring TMDB lookups will fail");
    return "";
  }
  return key;
}

export const TMDB_API_KEY = getTMDBApiKey();
