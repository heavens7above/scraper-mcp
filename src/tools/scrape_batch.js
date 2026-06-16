import { z } from 'zod';
import { fetchWithScraperApi } from '../lib/scraper.js';
import { cleanHtml, extractMetadata } from '../lib/html_cleaner.js';
import { enrichWithNvidiaNim } from '../lib/enricher.js';
import { GEARS, getGearDiagnostics } from '../lib/diagnostics.js';

export const name = 'scrape_batch';
export const description = 'Scrapes multiple URLs concurrently up to a specified limit, and enriches each URL using NVIDIA NIM.';

export const schema = z.object({
  urls: z.array(z.string()).max(10).describe('List of target URLs to process (maximum 10)'),
  prompt: z.string().describe('Instruction for enrichment applied to each URL'),
  render_js: z.boolean().optional().default(false).describe('Whether to use JS rendering via ScraperAPI (default: false for speed)'),
  delay_ms: z.number().optional().default(1000).describe('Delay in milliseconds between sequential requests (only active if concurrency is 1)'),
  concurrency: z.number().optional().default(3).describe('Number of concurrent requests to process in parallel (default: 3, max: 5)')
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Handle the scrape_batch tool execution.
 * @param {object} args 
 * @returns {Promise<{ content: Array<{ type: string, text: string }> }>}
 */
export async function handler(args) {
  const timestamp = new Date().toISOString();
  const { urls, prompt, render_js, delay_ms, concurrency } = args;

  const concurrencyLimit = Math.min(concurrency || 3, 5);
  console.log(`[${timestamp}] Calling tool 'scrape_batch' with ${urls.length} URLs (Concurrency: ${concurrencyLimit}, JS: ${render_js})`);

  const results = new Array(urls.length);
  let successCount = 0;
  let failCount = 0;
  let index = 0;

  // Worker loop for concurrent pools
  const worker = async () => {
    while (index < urls.length) {
      const currentIndex = index++;
      const url = urls[currentIndex];

      // Sequential delay if concurrency is set to 1
      if (concurrencyLimit === 1 && currentIndex > 0 && delay_ms > 0) {
        console.log(`[Scrape Batch] Sequential delay: waiting ${delay_ms}ms before fetching next URL...`);
        await sleep(delay_ms);
      }

      console.log(`[Scrape Batch] [${currentIndex + 1}/${urls.length}] Processing URL: ${url}`);

      try {
        const { html, statusCode, error, isFallback } = await fetchWithScraperApi(url, render_js);

        if (error) {
          const failedGear = isFallback ? GEARS.DIRECT_FETCH : GEARS.SCRAPER_PROXY;
          const diagnostics = getGearDiagnostics(failedGear, statusCode, error);

          results[currentIndex] = {
            url,
            enriched_data: null,
            status: 'failed',
            error: `Scraping error (status ${statusCode}): ${error}`,
            diagnostics
          };
          failCount++;
          continue;
        }

        const cleanText = cleanHtml(html);
        const { enriched_data, enrichment_error } = await enrichWithNvidiaNim(cleanText, prompt);

        if (enrichment_error) {
          const fallbackMetadata = extractMetadata(html);
          const diagnostics = getGearDiagnostics(GEARS.NVIDIA_AI, 500, enrichment_error);

          results[currentIndex] = {
            url,
            enriched_data: fallbackMetadata,
            status: 'partial_success',
            error: `Scrape succeeded, but enrichment failed: ${enrichment_error}`,
            fallback_applied: true,
            diagnostics
          };
          successCount++;
          continue;
        }

        results[currentIndex] = {
          url,
          enriched_data,
          status: 'success',
          error: null
        };
        successCount++;

      } catch (err) {
        console.error(`[Scrape Batch] [${currentIndex + 1}/${urls.length}] Unexpected error on ${url}:`, err);
        const diagnostics = getGearDiagnostics(GEARS.INTERNAL, 500, err.message);

        results[currentIndex] = {
          url,
          enriched_data: null,
          status: 'failed',
          error: `Unexpected error: ${err.message}`,
          diagnostics
        };
        failCount++;
      }
    }
  };

  // Launch parallel workers
  const workerPromises = [];
  const activeWorkers = Math.min(concurrencyLimit, urls.length);
  for (let i = 0; i < activeWorkers; i++) {
    workerPromises.push(worker());
  }

  await Promise.all(workerPromises);

  const resultPayload = {
    results,
    total: urls.length,
    success_count: successCount,
    fail_count: failCount
  };

  console.log(`[${new Date().toISOString()}] Tool 'scrape_batch' finished. Total: ${urls.length}, Successes: ${successCount}, Failures: ${failCount}`);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(resultPayload, null, 2)
      }
    ]
  };
}
