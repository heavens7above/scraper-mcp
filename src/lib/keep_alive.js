import process from 'node:process';

/**
 * Initialize a periodic keep-alive ping to prevent server sleeping.
 * Pings the health endpoint at PUBLIC_URL/health every 12 minutes (720,000 ms).
 */
export function startKeepAlive() {
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) {
    console.log('[Keep-Alive] PUBLIC_URL environment variable is not configured. Self-ping keep-alive is disabled.');
    return;
  }

  // Ensure url ends with /health
  const targetUrl = publicUrl.endsWith('/') ? `${publicUrl}health` : `${publicUrl}/health`;
  const intervalMs = 12 * 60 * 1000; // 12 minutes

  console.log(`[Keep-Alive] Initializing self-pings for: ${targetUrl} every 12 minutes.`);

  setInterval(async () => {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'ScraperMCP-KeepAlive/1.0'
        },
        // Timeout the fetch in 10s to avoid hanging sockets
        signal: AbortSignal.timeout(10000)
      });
      
      console.log(`[Keep-Alive] Self-ping status: ${response.status} (${response.statusText}) at ${new Date().toISOString()}`);
    } catch (err) {
      console.error(`[Keep-Alive] Self-ping failed at ${new Date().toISOString()}:`, err.message);
    }
  }, intervalMs);
}
