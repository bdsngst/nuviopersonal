# Nuvio Stremio Addon

A full-stack Stremio addon that aggregates streaming links from multiple providers.

## Overview

This project converts the nuvio-providers GitHub repository into a working Stremio addon, with additional providers from NuvioStreamsAddon. It fetches streaming links from 25 providers and serves them through Stremio-compatible API endpoints.

## Architecture

### Backend (Express + TypeScript)
- `server/stremio.ts` - Stremio manifest and stream handler with IMDB-to-TMDB conversion
- `server/providers/index.ts` - Provider management with VM sandbox and stream aggregation
- `server/providers/nuvio-streams/` - Native TypeScript providers from NuvioStreamsAddon
- `server/routes.ts` - API routes with CORS middleware
- `server/github-push.ts` - GitHub integration for code deployment

### Provider System (Two-Tier)
1. **VM Sandboxed Providers** (19 providers from nuvio-providers repo)
   - 4KHDHub, AnimeKai, UHDMovies, MoviesMod, DahmerMovies, DVDPlay, MalluMV, Vidlink, Vidnest, VidnestAnime, Cinevibe, Castle, ShowBox, StreamFlix, Vixsrc, YFlix, VIDEASY, NetMirror
   - Fetched from GitHub, executed in isolated VM context
   - 10-minute code cache TTL
   
2. **Native TypeScript Providers** (6 providers)
   - VidZee (3 streams) - Working
   - MP4Hydra (2 streams) - Working
   - MoviesMod (5 streams) - Working
   - SoaperTV - External service certificate issue
   - VidSrc - External service unavailable
   - MovieBox - API authentication issue (disabled)
   - Located in `server/providers/nuvio-streams/`

### Frontend (React + TypeScript)
- Dark purple theme (#7c3aed) optimized for streaming app aesthetic
- Provider selection grid showing 25 available providers
- Install button with Stremio URL copy functionality
- Statistics dashboard with provider counts

### Shared
- `shared/schema.ts` - TypeScript types for providers, streams, manifest

## Key Features
- IMDB-to-TMDB conversion for provider compatibility
- Parallel provider fetching from all enabled providers
- Secure provider sandbox using Node.js VM module (no eval)
- Provider code caching with 10-minute TTL
- CORS headers for Stremio compatibility
- Quality-sorted stream output (4K > 1080p > 720p)
- Typical stream counts: 50-60+ per popular movie

## API Endpoints
- `GET /manifest.json` - Stremio addon manifest
- `GET /stream/:type/:id.json` - Stream endpoint (e.g., /stream/movie/tt0468569.json)
- `GET /api/addon-info` - Addon metadata for frontend
- `GET /api/providers` - List of available providers

## Security
Provider code (VM sandbox) runs in an isolated context with:
- Whitelisted modules only (cheerio, crypto-js, axios)
- No access to process, filesystem, or arbitrary require
- 30-second execution timeout
- Self-referential globals (global, globalThis, window)

Native TypeScript providers use centralized TMDB API key from config.

## Deployment
Published to Replit and pushed to GitHub: https://github.com/bdsngst/nuviopersonal

To deploy on Linux:
```bash
git clone https://github.com/bdsngst/nuviopersonal.git
cd nuviopersonal
npm install
export TMDB_API_KEY=your_tmdb_api_key
npm run build
npm start
```
