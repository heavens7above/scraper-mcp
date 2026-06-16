import { z } from 'zod';
import { fetchWithScraperApi } from '../lib/scraper.js';
import { cleanHtml, extractMetadata } from '../lib/html_cleaner.js';
import { enrichWithNvidiaNim } from '../lib/enricher.js';
import { GEARS, getGearDiagnostics } from '../lib/diagnostics.js';

export const name = 'scrape_and_enrich';
export const description = 'Scrapes a URL, cleans the content, and enriches it using NVIDIA NIM LLM to extract structured data as JSON.';

export const schema = {
  url: z.string().describe('The target URL to scrape and enrich'),
  prompt: z.string().describe('Instruction for enrichment, e.g. "Extract all project names and client names as JSON"'),
  render_js: z.boolean().optional().default(true).describe('Whether to use JS rendering via ScraperAPI (default: true)'),
  country_code: z.string().optional().describe('Proxy country code e.g. "in" for India, "us" for USA')
};

/**
 * Handle the scrape_and_enrich tool execution.
 * @param {object} args 
 * @returns {Promise<{ content: Array<{ type: string, text: string }> }>}
 */
export async function handler(args) {
  const timestamp = new Date().toISOString();
  const { url, prompt, render_js, country_code } = args;

  console.log(`[${timestamp}] Calling tool 'scrape_and_enrich' for URL: ${url} (Prompt: "${prompt.substring(0, 50)}...")`);

  try {
    const { html, statusCode, error, isFallback } = await fetchWithScraperApi(url, render_js, country_code);

    if (error) {
      const failedGear = isFallback ? GEARS.DIRECT_FETCH : GEARS.SCRAPER_PROXY;
      const diagnostics = getGearDiagnostics(failedGear, statusCode, error);

      const resultPayload = {
        url,
        enriched_data: null,
        raw_text: '',
        status_code: statusCode,
        error: error,
        diagnostics
      };

      console.log(`[${new Date().toISOString()}] Tool 'scrape_and_enrich' failed during scraping: ${error} (Status: ${statusCode})`);

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

    // Call enrichment API
    const { enriched_data, enrichment_error } = await enrichWithNvidiaNim(cleanText, prompt);

    if (enrichment_error) {
      // Local fallback metadata extraction
      const fallbackMetadata = extractMetadata(html);
      const diagnostics = getGearDiagnostics(GEARS.NVIDIA_AI, 500, enrichment_error);

      // "If NVIDIA NIM fails, return raw scraped text with enrichment_error field"
      const resultPayload = {
        url,
        enriched_data: fallbackMetadata, // local regex / meta tags fallback
        raw_text: cleanText,
        status_code: 200, // Scraping was successful
        enrichment_error: enrichment_error,
        fallback_applied: true,
        diagnostics
      };

      console.log(`[${new Date().toISOString()}] Tool 'scrape_and_enrich' scraping succeeded but NIM enrichment failed. Local fallback applied. Error: ${enrichment_error}`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultPayload, null, 2)
          }
        ]
      };
    }

    const resultPayload = {
      url,
      enriched_data,
      raw_text: cleanText,
      status_code: 200
    };

    console.log(`[${new Date().toISOString()}] Tool 'scrape_and_enrich' completed successfully for URL: ${url}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultPayload, null, 2)
        }
      ]
    };

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Tool 'scrape_and_enrich' unexpected error:`, err);

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
