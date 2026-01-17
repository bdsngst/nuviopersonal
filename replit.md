# Nuvio Stremio Addon

A full-stack Stremio addon that aggregates streaming links from multiple providers.

## Overview

This project converts the nuvio-providers GitHub repository into a working Stremio addon, with additional providers from NuvioStreamsAddon. It fetches streaming links from 23+ providers and serves them through Stremio-compatible API endpoints.

## Architecture

### Backend (Express + TypeScript)
- `server/stremio.ts` - Stremio manifest and stream handler with IMDB→TMDB conversion
- `server/providers/index.ts` - Provider management with VM sandbox and stream aggregation
- `server/providers/nuvio-streams/` - Native TypeScript providers from NuvioStreamsAddon
- `server/routes.ts` - API routes with CORS middleware

### Provider System (Two-Tier)
1. **VM Sandboxed Providers** (19 providers from nuvio-providers repo)
   - Fetched from GitHub, executed in isolated VM context
   - 10-minute code cache TTL
   
2. **Native TypeScript Providers** (5 providers from NuvioStreamsAddon)
   - VidZee (3 streams), MP4Hydra (2 streams), MoviesMod (5 streams)
   - SoaperTV and VidSrc currently unavailable due to external service issues
   - Run natively with shared TMDB API key config
   - Located in `server/providers/nuvio-streams/`

### Frontend (React + TypeScript)
- Dark purple theme (#7c3aed) optimized for streaming app aesthetic
- Provider selection grid showing 23 available providers
- Install button with Stremio URL copy functionality
- Statistics dashboard with provider counts

### Shared
- `shared/schema.ts` - TypeScript types for providers, streams, manifest

## Key Features
- IMDB-to-TMDB conversion for provider compatibility
- Parallel provider fetching from all 23 enabled providers
- Secure provider sandbox using Node.js VM module (no eval)
- Provider code caching with 10-minute TTL
- CORS headers for Stremio compatibility
- Quality-sorted stream output (4K > 1080p > 720p)

## API Endpoints
- `GET /manifest.json` - Stremio addon manifest
- `GET /stream/:type/:id.json` - Stream endpoint (e.g., /stream/movie/tt0468569.json)
- `GET /addon-info` - Addon metadata for frontend
- `GET /providers` - List of available providers

## Security
Provider code (VM sandbox) runs in an isolated context with:
- Whitelisted modules only (cheerio, crypto-js, axios)
- No access to process, filesystem, or arbitrary require
- 30-second execution timeout
- Self-referential globals (global, globalThis, window)

Native TypeScript providers use centralized TMDB API key from config.
