# scraper-mcp

A production-grade Model Context Protocol (MCP) server in Node.js that exposes web scraping and AI enrichment tools via SSE transport. Built for integration with Claude.ai and deployable to Railway.

## Stack
- **Runtime**: Node.js 20+
- **Protocol SDK**: `@modelcontextprotocol/sdk` (using `McpServer` and `SSEServerTransport`)
- **Web Framework**: Express
- **Scraping**: [ScraperAPI](https://www.scraperapi.com/) REST API
- **AI Extraction**: [NVIDIA NIM](https://build.nvidia.com/) (OpenAI-compatible chat completions)
- **HTML Parsing**: Cheerio

## Environment Variables
Create a `.env` file in the root of the project (see `.env.example`):

```env
SCRAPERAPI_KEY=your_scraperapi_key_here
NVIDIA_API_KEY=your_nvidia_api_key_here
NVIDIA_MODEL=nvidia/llama-3.1-nemotron-ultra-253b-v1
PORT=3000
```

## Tools Exposed

### 1. `scrape_url`
Scrapes the target URL using ScraperAPI, strips HTML tags (scripts, styling, headers, nav, footers), and returns the clean text context.
- **Inputs**:
  - `url` (string, required)
  - `render_js` (boolean, optional, default: `true`)
  - `country_code` (string, optional, e.g. `"in"`, `"us"`)
- **Returns**: `{ url, text, status_code, word_count }`

### 2. `scrape_and_enrich`
Scrapes a URL, cleans it, truncates to 6000 characters to prevent prompt/context overflows, and sends it to NVIDIA NIM for structured data extraction.
- **Inputs**:
  - `url` (string, required)
  - `prompt` (string, required): e.g. `"Extract all company names, emails, and phone numbers as JSON"`
  - `render_js` (boolean, optional, default: `true`)
  - `country_code` (string, optional)
- **Returns**: `{ url, enriched_data, raw_text, status_code }`

### 3. `scrape_batch`
Iterates over a list of URLs sequentially (with a delay to respect rate limits) and applies the scraping and enrichment logic to each.
- **Inputs**:
  - `urls` (array of strings, required, max 10)
  - `prompt` (string, required): Enrichment instruction applied to all URLs
  - `render_js` (boolean, optional, default: `false` for speed)
  - `delay_ms` (number, optional, default: `1000`)
- **Returns**: `{ results, total, success_count, fail_count }`

## Running Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server** (loads `.env` automatically in Node 20.6+):
   ```bash
   npm run dev
   ```
   Or standard run:
   ```bash
   npm start
   ```

## API Endpoints

- **Health Probe**: `GET /health`
- **SSE Transport Handshake**: `GET /sse`
- **MCP Message Handling**: `POST /messages?sessionId=<session-id>`

## Deployment to Railway
This project contains a `Dockerfile` optimized for minimal size (`node:20-alpine`).
To deploy:
1. Connect this repository to Railway.
2. Configure the required environment variables: `SCRAPERAPI_KEY`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, and `PORT`.
3. Railway will build using the Dockerfile and expose the public domain.
4. Add the server to Claude by pointing to `https://[your-railway-domain]/sse`.
