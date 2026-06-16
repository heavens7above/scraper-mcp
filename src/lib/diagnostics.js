/**
 * System components ("gears") that can fail.
 */
export const GEARS = {
  SCRAPER_PROXY: 'ScraperAPI Proxy Gear',
  NVIDIA_AI: 'NVIDIA NIM AI Enrichment Gear',
  DIRECT_FETCH: 'Direct Network Fallback Gear',
  INTERNAL: 'Internal Server Gear'
};

/**
 * Generate user-facing diagnostics warnings.
 * 
 * @param {string} gear The failing component (from GEARS)
 * @param {number} statusCode HTTP response status code
 * @param {string} rawError Error message details
 * @returns {object} Structured user-facing warning
 */
export function getGearDiagnostics(gear, statusCode, rawError) {
  let userWarning = '';
  let actionRequired = '';

  switch (gear) {
    case GEARS.SCRAPER_PROXY:
      if (statusCode === 401 || statusCode === 403) {
        userWarning = 'ScraperAPI authentication failed. Your proxy API key appears invalid or expired.';
        actionRequired = 'Please verify and correct the SCRAPERAPI_KEY environment variable in your Railway deployment settings.';
      } else if (statusCode === 429) {
        userWarning = 'ScraperAPI rate limit reached. Concurrent scraping limits exceeded.';
        actionRequired = 'Try lowering the concurrency parameter, increasing delay_ms, or upgrading your ScraperAPI plan.';
      } else {
        userWarning = `ScraperAPI returned error code ${statusCode}: ${rawError}`;
        actionRequired = 'Verify target URL validity and check ScraperAPI service status.';
      }
      break;

    case GEARS.NVIDIA_AI:
      if (statusCode === 401 || statusCode === 403) {
        userWarning = 'NVIDIA NIM authentication failed. Your NIM API key is unauthorized or invalid.';
        actionRequired = 'Please check and update the NVIDIA_API_KEY environment variable in your Railway config settings.';
      } else if (statusCode === 429) {
        userWarning = 'NVIDIA NIM rate limit hit. Too many concurrent AI completion requests.';
        actionRequired = 'Wait a few moments before resubmitting. Reduce request frequency or batch sizes.';
      } else {
        userWarning = `NVIDIA NIM failed to process structured data (status ${statusCode}): ${rawError}`;
        actionRequired = 'Check model configuration parameters (NVIDIA_MODEL) and prompt content size.';
      }
      break;

    case GEARS.DIRECT_FETCH:
      userWarning = `Direct network connection fallback failed: ${rawError}`;
      actionRequired = 'The target website could not be contacted directly. Check website availability or target domain blocklists.';
      break;

    default:
      userWarning = `An unexpected server error occurred: ${rawError}`;
      actionRequired = 'Inspect Railway server stdout logs to identify internal Node.js exceptions.';
  }

  return {
    failed_gear: gear,
    status_code: statusCode,
    user_warning: userWarning,
    action_required: actionRequired,
    timestamp: new Date().toISOString()
  };
}
