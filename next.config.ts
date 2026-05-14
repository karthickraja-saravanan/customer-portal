import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Monorepo root only inside E2B (`envs` on Sandbox.create). Omit on Vercel / Render / Railway / Amplify.
const isE2bSandbox = process.env.E2B_SANDBOX === "true";

const nextConfig: NextConfig = {
  ...(isE2bSandbox
    ? { outputFileTracingRoot: path.join(__dirname, "..", "..") }
    : {}),
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
        poll: 1000, // Reduced from 500ms to lower CPU usage
        aggregateTimeout: 300,
        ignored: ["**/node_modules/**", "**/.next/**", "**/.git/**"],
      };
    }
    return config;
  },
};

export default nextConfig;
