import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PostHog trailing-slash paths (/i/v0/e/) must not be 308-normalized.
  // Side effect (accepted): /agencies/ no longer redirects to /agencies —
  // all internal links, sitemap and metadata emit non-trailing URLs.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      // Exactly one narrow rule — a /relay/:path* catch-all would be an
      // unauthenticated open relay to the whole PostHog ingest host.
      {
        source: "/relay/i/v0/e/",
        destination: "https://us.i.posthog.com/i/v0/e/",
      },
    ];
  },
};

export default nextConfig;
