import { z } from 'zod';
import { fetchWithScraperApi } from '../lib/scraper.js';
import { cleanHtml } from '../lib/html_cleaner.js';
import { GEARS, getGearDiagnostics } from '../lib/diagnostics.js';

export const name = 'scrape_url';
export const description = 'Scrapes a target URL and returns clean readable text with HTML stripped.';

export const schema = {
  url: z.string().describe('The target URL to scrape'),
  render_js: z.boolean().optional().default(true).describe('Whether to use JS rendering via ScraperAPI (default: true)'),
  country_code: z.string().optional().describe('Proxy country code e.g. "in" for India, "us" for USA')
};

/**
 * Calculate approximate word count.
 * @param {string} text 
 * @returns {number}
 */
function getWordCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Handle the scrape_url tool execution.
 * @param {object} args 
 * @returns {Promise<{ content: Array<{ type: string, text: string }>, isError?: boolean }>}
 */
export async function handler(args) {
  const timestamp = new Date().toISOString();
  const { url, render_js, country_code } = args;
  
  console.log(`[${timestamp}] Calling tool 'scrape_url' for URL: ${url} (JS: ${render_js}, Proxy: ${country_code || 'none'})`);

  try {
    const { html, statusCode, error, isFallback } = await fetchWithScraperApi(url, render_js, country_code);

    if (error) {
      // Determine which gear failed
      const failedGear = isFallback ? GEARS.DIRECT_FETCH : GEARS.SCRAPER_PROXY;
      const diagnostics = getGearDiagnostics(failedGear, statusCode, error);

      const resultPayload = {
        url,
        text: '',
        status_code: statusCode,
        word_count: 0,
        error: error,
        diagnostics
      };
      
      console.log(`[${new Date().toISOString()}] Tool 'scrape_url' for URL: ${url} finished with status: ${statusCode} (Error: ${error})`);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultPayload, null, 2)
          }
        ]
      };
    }

    const cleanText = cleanHtml(html);
    const wordCount = getWordCount(cleanText);

    const resultPayload = {
      url,
      text: cleanText,
      status_code: 200,
      word_count: wordCount
    };

    console.log(`[${new Date().toISOString()}] Tool 'scrape_url' for URL: ${url} completed successfully. Status: 200, Words: ${wordCount}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultPayload, null, 2)
        }
      ]
    };

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Tool 'scrape_url' unexpected error:`, err);
    
    const diagnostics = getGearDiagnostics(GEARS.INTERNAL, 500, err.message);
    const resultPayload = {
      url,
      error: 'unreachable',
      message: err.message,
      status_code: 500,
      diagnostics
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultPayload, null, 2)
        }
      ]
    };
  }
}
