import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NAME, VERSION } from "./config.js";
import { registerTools } from "./tools.js";

const server = new McpServer({ name: NAME, version: VERSION });
registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout carries JSON-RPC; diagnostics go to stderr only.
console.error(`${NAME} MCP server running on stdio`);
