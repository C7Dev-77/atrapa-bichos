// Vite + TanStack Start configuration for Atrapa Bichos
// Plugins included: TanStack Start, React, Tailwind CSS, Path aliases, Nitro server bundle.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
