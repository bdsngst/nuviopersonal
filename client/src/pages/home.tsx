import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { Copy, Check, ExternalLink, Play, Film, Tv, Zap, Globe, Download, Info } from "lucide-react";
import { useState } from "react";
import type { AddonInfo, Provider } from "@shared/schema";

function ProviderCard({ provider }: { provider: Provider }) {
  return (
    <Card className="hover-elevate transition-all duration-200" data-testid={`card-provider-${provider.id}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {provider.logo ? (
              <img 
                src={provider.logo} 
                alt={provider.name} 
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Play className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm truncate">{provider.name}</h3>
              {provider.limited && (
                <Badge variant="outline" className="text-xs">Limited</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {provider.description || "Stream content from this provider"}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {provider.supportedTypes.includes("movie") && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Film className="w-3 h-3" />
                  Movies
                </Badge>
              )}
              {provider.supportedTypes.includes("tv") && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Tv className="w-3 h-3" />
                  TV
                </Badge>
              )}
              {provider.contentLanguage && provider.contentLanguage.length > 0 && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Globe className="w-3 h-3" />
                  {provider.contentLanguage.slice(0, 3).join(", ")}
                  {provider.contentLanguage.length > 3 && "..."}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProvidersSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InstallButton({ installUrl }: { installUrl: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(installUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInstall = () => {
    window.open(installUrl, "_blank");
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button 
        size="lg" 
        onClick={handleInstall}
        className="gap-2"
        data-testid="button-install-stremio"
      >
        <Download className="w-4 h-4" />
        Install in Stremio
      </Button>
      <Button 
        size="lg" 
        variant="outline" 
        onClick={handleCopy}
        className="gap-2"
        data-testid="button-copy-url"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="w-4 h-4" />
            Copy URL
          </>
        )}
      </Button>
    </div>
  );
}

function StatsCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-card border">
      <div className="p-2 rounded-md bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { data, isLoading, error } = useQuery<AddonInfo>({
    queryKey: ["/api/addon-info"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold text-lg leading-tight">Nuvio</h1>
              <p className="text-xs text-muted-foreground">Stremio Addon</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild className="hidden sm:flex gap-1.5">
              <a href="https://github.com/yoruix/nuvio-providers" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                GitHub
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <section className="text-center space-y-4 py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
            <Zap className="w-4 h-4" />
            Multi-Provider Streaming
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Stream from <span className="text-primary">Multiple Sources</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Access movies and TV shows from various streaming providers directly in Stremio. 
            One addon, many sources.
          </p>
          {data && (
            <div className="pt-4">
              <InstallButton installUrl={data.installUrl} />
            </div>
          )}
        </section>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : data ? (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatsCard 
              icon={Play} 
              label="Active Providers" 
              value={data.providers.filter(p => p.enabled).length} 
            />
            <StatsCard 
              icon={Film} 
              label="Movie Providers" 
              value={data.providers.filter(p => p.supportedTypes.includes("movie")).length} 
            />
            <StatsCard 
              icon={Tv} 
              label="TV Show Providers" 
              value={data.providers.filter(p => p.supportedTypes.includes("tv")).length} 
            />
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold">Available Providers</h3>
              <p className="text-sm text-muted-foreground">
                All providers are automatically enabled when you install the addon
              </p>
            </div>
          </div>

          {isLoading ? (
            <ProvidersSkeleton />
          ) : error ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="p-6 text-center">
                <p className="text-destructive">Failed to load providers. Please try again later.</p>
              </CardContent>
            </Card>
          ) : data ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.providers.filter(p => p.enabled).map((provider) => (
                <ProviderCard key={provider.id} provider={provider} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="w-5 h-5" />
                How to Install
              </CardTitle>
              <CardDescription>
                Get started with Nuvio in Stremio in just a few steps
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">1</div>
                  <h4 className="font-medium">Click Install</h4>
                  <p className="text-sm text-muted-foreground">Click the "Install in Stremio" button above or copy the manifest URL</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">2</div>
                  <h4 className="font-medium">Open Stremio</h4>
                  <p className="text-sm text-muted-foreground">Stremio will automatically detect the addon and ask to install it</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">3</div>
                  <h4 className="font-medium">Start Streaming</h4>
                  <p className="text-sm text-muted-foreground">Search for any movie or TV show and see streams from multiple providers</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {data && (
          <section className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Manifest URL</CardTitle>
                <CardDescription>Use this URL to manually install the addon</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted font-mono text-sm break-all">
                  <code className="flex-1">{data.installUrl.replace("stremio://", "")}</code>
                </div>
              </CardContent>
            </Card>
          </section>
        )}
      </main>

      <footer className="border-t mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>Nuvio Stremio Addon - No content is hosted by this service</p>
            <div className="flex items-center gap-4">
              <a 
                href="https://github.com/yoruix/nuvio-providers" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <span>GPL-3.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
