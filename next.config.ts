import type { NextConfig } from "next";
import { NEXTX_SLUGS } from "./src/lib/nextx";

const isProd = process.env.NODE_ENV === "production";

/**
 * Content Security Policy. Next.js injects inline bootstrap scripts, so without
 * per-request nonces (which would make every page dynamic) scripts need
 * 'unsafe-inline'. The policy still locks down where code, data and frames can
 * come from. Dev is exempt because HMR needs eval and websockets.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), fullscreen=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // NextX titles run inside the NextX app; their old game pages send you there (query kept).
  async redirects() {
    return NEXTX_SLUGS.map((slug) => ({ source: `/games/${slug}`, destination: `/nextx/play/${slug}`, permanent: false }));
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
