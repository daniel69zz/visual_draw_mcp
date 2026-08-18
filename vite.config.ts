import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The playground UI. The MCP server does not depend on this build - it ships
 * its own dependency-free viewer for the ChatGPT iframe (src/mcp/widget.ts).
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, open: true },
  build: { outDir: "dist-ui", emptyOutDir: true },
});
