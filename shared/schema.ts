import { z } from "zod";

export const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  supportedTypes: z.array(z.enum(["movie", "tv"])),
  filename: z.string(),
  enabled: z.boolean(),
  limited: z.boolean().optional(),
  logo: z.string().optional(),
  contentLanguage: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  disabledPlatforms: z.array(z.string()).optional(),
  supportsExternalPlayer: z.boolean().optional(),
});

export type Provider = z.infer<typeof providerSchema>;

export const streamSchema = z.object({
  name: z.string(),
  title: z.string(),
  url: z.string(),
  quality: z.string(),
  size: z.string().optional(),
  provider: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export type Stream = z.infer<typeof streamSchema>;

export const stremioStreamSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  url: z.string().optional(),
  infoHash: z.string().optional(),
  fileIdx: z.number().optional(),
  behaviorHints: z.object({
    notWebReady: z.boolean().optional(),
    bingeGroup: z.string().optional(),
    proxyHeaders: z.object({
      request: z.record(z.string()).optional(),
    }).optional(),
  }).optional(),
});

export type StremioStream = z.infer<typeof stremioStreamSchema>;

export const manifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string(),
  logo: z.string().optional(),
  background: z.string().optional(),
  resources: z.array(z.string()),
  types: z.array(z.string()),
  catalogs: z.array(z.object({
    type: z.string(),
    id: z.string(),
    name: z.string().optional(),
  })),
  idPrefixes: z.array(z.string()).optional(),
  behaviorHints: z.object({
    configurable: z.boolean().optional(),
    configurationRequired: z.boolean().optional(),
  }).optional(),
});

export type Manifest = z.infer<typeof manifestSchema>;

export const addonInfoSchema = z.object({
  manifest: manifestSchema,
  providers: z.array(providerSchema),
  installUrl: z.string(),
});

export type AddonInfo = z.infer<typeof addonInfoSchema>;

export const users = {} as any;
export const insertUserSchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = { id: string; username: string; password: string };
