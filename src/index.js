import 'dotenv/config';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import * as scrapeUrlTool from './tools/scrape_url.js';
import * as scrapeAndEnrichTool from './tools/scrape_and_enrich.js';
import * as scrapeBatchTool from './tools/scrape_batch.js';
import { logUserEvent } from './lib/user_logger.js';
import { startKeepAlive } from './lib/keep_alive.js';
import { authenticateToken } from './lib/auth.js';

const PORT = process.env.PORT || 3000;

// Initialize MCP Server
const server = new McpServer({
  name: 'scraper-mcp',
  version: '1.0.0'
});

// Register Tools
server.registerTool(
  scrapeUrlTool.name,
  {
    description: scrapeUrlTool.description,
    inputSchema: scrapeUrlTool.schema
  },
  scrapeUrlTool.handler
);

server.registerTool(
  scrapeAndEnrichTool.name,
  {
    description: scrapeAndEnrichTool.description,
    inputSchema: scrapeAndEnrichTool.schema
  },
  scrapeAndEnrichTool.handler
);

server.registerTool(
  scrapeBatchTool.name,
  {
    description: scrapeBatchTool.description,
    inputSchema: scrapeBatchTool.schema
  },
  scrapeBatchTool.handler
);

// Initialize Express App
const app = express();
app.use(express.json());

// Active SSE transport sessions
const transports = {};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    tools: [
      scrapeUrlTool.name,
      scrapeAndEnrichTool.name,
      scrapeBatchTool.name
    ]
  });
});

// GET: Establish SSE connection
app.get('/sse', authenticateToken, async (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.ip;
  const userAgent = req.headers['user-agent'] || 'unknown';

  const transport = new SSEServerTransport('/messages', res);
  const sessionId = transport.sessionId;
  transports[sessionId] = transport;

  logUserEvent('session_connect', {
    sessionId,
    ip: clientIp,
    userAgent,
    headers: req.headers
  });

  res.on('close', () => {
    logUserEvent('session_disconnect', {
      sessionId,
      ip: clientIp,
      userAgent
    });
    delete transports[sessionId];
  });

  try {
    await server.connect(transport);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error during SSE transport connection:`, err);
    res.status(500).send('Failed to establish SSE transport connection.');
  }
});

// POST: Handle message routing for specific SSE sessions
app.post('/messages', authenticateToken, async (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) {
    return res.status(400).send('Missing sessionId query parameter');
  }

  const transport = transports[sessionId];
  if (!transport) {
    return res.status(404).send(`No active session found for ID: ${sessionId}`);
  }

  const clientIp = req.headers['x-forwarded-for'] || req.ip;
  const userAgent = req.headers['user-agent'] || 'unknown';

  // Log user footprint if request is a tool execution call
  if (req.body && req.body.method === 'tools/call') {
    logUserEvent('tool_call', {
      sessionId,
      ip: clientIp,
      userAgent,
      toolName: req.body.params?.name,
      arguments: req.body.params?.arguments
    });
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error handling message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).send('Internal error processing message');
    }
  }
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] scraper-mcp server running on port ${PORT}`);
  console.log(`SSE connection endpoint: http://localhost:${PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${PORT}/messages`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);

  // Start the keep-alive pinger loop
  startKeepAlive();
});
