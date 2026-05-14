import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Monorepo root (as-platform). Next otherwise picks the wrong workspace root when
// a stray package-lock.json exists under this app; also stabilizes file tracing.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  reactStrictMode: true,
  typescript: {
  ignoreBuildErrors: true,
},
  webpack: (config, { dev }) => {
    if (dev) {
      // E2B sandboxes are restored from a VM snapshot, which leaves inotify
      // file descriptors stale. Polling-based watching uses setInterval which
      // survives snapshot restore, ensuring HMR + Tailwind CSS recompilation
      // fires correctly when sandbox.files.write() writes new page files.
      config.watchOptions = {
        poll: 1000,           // Reduced from 500ms to lower CPU usage
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      };
    }
    return config;
  },
};

export default nextConfig;
