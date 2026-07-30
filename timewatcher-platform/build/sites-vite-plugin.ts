import type { Plugin } from "vite";

// Minimal reconstruction of the project-local "OpenAI Sites" Vite plugin.
//
// The original lived under build/ (ignored by the repo root .gitignore) and was
// never committed, so `vinext build` failed on every fresh checkout — CI and the
// AWS deploy included — with "Could not resolve ./build/sites-vite-plugin".
//
// The plugin only wires OpenAI Sites hosting metadata (.openai/hosting.json) at
// build time. This dashboard is server-rendered and reads all operational data
// from the platform API at runtime, so a no-op plugin restores a working build
// without changing application behaviour. Replace with the upstream plugin if
// Sites-specific build wiring is reintroduced.
export function sites(): Plugin {
  return { name: "openai-sites" };
}
