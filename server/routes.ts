import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { getStremioManifest, getStreamsForContent, getAddonInfo } from "./stremio";
import { getEnabledProviders } from "./providers";

function corsMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (_req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(corsMiddleware);

  function getBaseUrl(req: Request): string {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
    return `${protocol}://${host}`;
  }

  app.get("/manifest.json", async (req, res) => {
    try {
      const baseUrl = getBaseUrl(req);
      const manifest = getStremioManifest(baseUrl);
      res.json(manifest);
    } catch (error) {
      console.error("[Routes] Error getting manifest:", error);
      res.status(500).json({ error: "Failed to get manifest" });
    }
  });

  app.get("/stream/:type/:id.json", async (req, res) => {
    try {
      const { type, id } = req.params;
      
      if (!["movie", "series"].includes(type)) {
        return res.json({ streams: [] });
      }
      
      console.log(`[Routes] Stream request: ${type}/${id}`);
      const result = await getStreamsForContent(type, id);
      res.json(result);
    } catch (error) {
      console.error("[Routes] Error getting streams:", error);
      res.json({ streams: [] });
    }
  });

  app.get("/api/addon-info", async (req, res) => {
    try {
      const baseUrl = getBaseUrl(req);
      const info = await getAddonInfo(baseUrl);
      res.json(info);
    } catch (error) {
      console.error("[Routes] Error getting addon info:", error);
      res.status(500).json({ error: "Failed to get addon info" });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/providers", async (_req, res) => {
    try {
      const providers = await getEnabledProviders();
      res.json(providers);
    } catch (error) {
      console.error("[Routes] Error getting providers:", error);
      res.status(500).json({ error: "Failed to get providers" });
    }
  });

  return httpServer;
}
