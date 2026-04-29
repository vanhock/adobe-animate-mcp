import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAnimateMcpServer } from "./server/createServer.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const server = createAnimateMcpServer();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
