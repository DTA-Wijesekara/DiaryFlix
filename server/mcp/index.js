// Load env before any other module reads process.env
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Server }             = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { initDB } = require('../db');

const analytics = require('./tools/analytics');
const users     = require('./tools/users');
const content   = require('./tools/content');

const tools = [
  ...analytics.definitions,
  ...users.definitions,
  ...content.definitions,
];

const handlers = {
  ...analytics.handlers,
  ...users.handlers,
  ...content.handlers,
};

const server = new Server(
  { name: 'diaryflix', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = handlers[name];

  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args ?? {});
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

async function main() {
  await initDB();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[DiaryFLIX MCP] Ready — connected to database');
}

main().catch(err => {
  console.error('[DiaryFLIX MCP] Fatal error:', err.message);
  process.exit(1);
});
