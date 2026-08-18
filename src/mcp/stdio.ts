#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVisualMcpServer } from "./server.js";

/**
 * stdio transport: for local clients that spawn the server as a subprocess
 * (Claude Desktop, MCP Inspector, Cursor, the ChatGPT Secure MCP Tunnel).
 *
 * Nothing may be written to stdout except protocol messages - stdout IS the
 * transport - so all diagnostics go to stderr.
 */
async function main(): Promise<void> {
  const server = createVisualMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("visual-mcp: listening on stdio");
}

main().catch((err) => {
  console.error("visual-mcp: fatal error", err);
  process.exit(1);
});
