import process from 'node:process';

/**
 * Delay execution for a given number of milliseconds.
 * @param {number} ms 
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a URL via ScraperAPI REST endpoint.
 * Respects rate limits with a single retry on 429 after 2 seconds.
 * 
 * @param {string} targetUrl The target URL to scrape.
 * @param {boolean} renderJs Whether to enable JS rendering on ScraperAPI.
 * @param {string} [countryCode] Proxy country code (e.g. "in", "us").
 * @returns {Promise<{ html: string | null, statusCode: number, error: string | null }>}
 */
export async function fetchWithScraperApi(targetUrl, renderJs = true, countryCode) {
  const apiKey = process.env.SCRAPERAPI_KEY;
  if (!apiKey) {
    return {
      html: null,
      statusCode: 500,
      error: 'SCRAPERAPI_KEY environment variable is not configured.'
    };
  }

  // Construct ScraperAPI URL
  const scraperApiUrl = new URL('https://api.scraperapi.com');
  scraperApiUrl.searchParams.set('api_key', apiKey);
  scraperApiUrl.searchParams.set('url', targetUrl);
  
  if (renderJs) {
    scraperApiUrl.searchParams.set('render', 'true');
  } else {
    scraperApiUrl.searchParams.set('render', 'false');
  }

  if (countryCode) {
    scraperApiUrl.searchParams.set('country_code', countryCode.toLowerCase());
  }

  const performFetch = async () => {
    try {
      const response = await fetch(scraperApiUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ScraperMCP/1.0'
        },
        signal: AbortSignal.timeout(20000) // 20s timeout per ScraperAPI attempt
      });
      
      return response;
    } catch (err) {
      console.error(`[ScraperAPI] Network or connection error when fetching ${targetUrl}:`, err.message);
      return {
        networkError: true,
        message: err.message
      };
    }
  };

  let retries = 3;
  let delay = 1500;
  let attempt = 0;
  let response;

  while (attempt <= retries) {
    if (attempt > 0) {
      console.warn(`[ScraperAPI] Retrying fetch for ${targetUrl} (Attempt ${attempt}/${retries}) in ${delay}ms due to rate limit or server error...`);
      await sleep(delay);
      delay *= 2; // exponential backoff
    }

    response = await performFetch();
    
    // Only retry on network errors, 429 rate limits, or 5xx server errors
    if (!response.networkError && response.status !== 429 && response.status < 500) {
      break;
    }
    
    attempt++;
  }

  // Fallback to direct fetch if ScraperAPI failed or returned non-200
  if (response.networkError || response.status !== 200) {
    console.warn(`[ScraperAPI] Failed to fetch ${targetUrl} via ScraperAPI (Status: ${response.status || 'Network Error'}). Attempting direct fetch fallback...`);
    try {
      const directResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout for direct fallback
      });

      if (directResponse.status === 200) {
        const html = await directResponse.text();
        console.log(`[ScraperAPI] Direct fetch fallback succeeded for ${targetUrl}`);
        return {
          html,
          statusCode: 200,
          error: null,
          isFallback: true
        };
      } else {
        console.warn(`[ScraperAPI] Direct fetch fallback failed with status ${directResponse.status}`);
      }
    } catch (fallbackErr) {
      console.error(`[ScraperAPI] Direct fetch fallback failed for ${targetUrl}:`, fallbackErr.message);
    }
  }

  // Standard processing of the final ScraperAPI response if no fallback succeeded
  if (response.networkError) {
    return {
      html: null,
      statusCode: 503,
      error: `Network error: ${response.message}`
    };
  }

  if (response.status !== 200) {
    let errorMsg = `ScraperAPI returned status code ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        errorMsg += `: ${text.substring(0, 200)}`;
      }
    } catch (_) {}
    
    return {
      html: null,
      statusCode: response.status,
      error: errorMsg
    };
  }

  try {
    const html = await response.text();
    return {
      html,
      statusCode: 200,
      error: null
    };
  } catch (err) {
    return {
      html: null,
      statusCode: 500,
      error: `Failed to read HTML response: ${err.message}`
    };
  }
}
