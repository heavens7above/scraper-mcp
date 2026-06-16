import * as cheerio from 'cheerio';

/**
 * Clean HTML raw content to extract pure readable text.
 * Removes unnecessary elements (script, style, nav, footer, iframe, noscript).
 * Normalizes double spaces, tabs, and multiple blank lines.
 * 
 * @param {string} html Raw HTML content.
 * @returns {string} Cleaned readable text.
 */
export function cleanHtml(html) {
  if (!html) {
    return '';
  }

  const $ = cheerio.load(html);

  // Remove elements that don't contain relevant main content or contaminate AI token budget
  $('script, style, nav, footer, noscript, iframe, svg, header').remove();

  // Extract text content
  let text = $('body').text() || $.text();

  // Clean and normalize whitespace
  text = text
    .replace(/\r\n/g, '\n') // Normalize newlines
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ') // Tabs to spaces
    .replace(/ +/g, ' ') // Collapse multiple spaces
    .replace(/\n\s*\n+/g, '\n\n') // Collapse multiple newlines to max double-newlines
    .trim();

  return text;
}

/**
 * Extract basic structured metadata (title, description, emails, phone numbers)
 * as a local fallback when AI models or parsers fail to enrich.
 * 
 * @param {string} html Raw HTML content.
 * @returns {object} Extracted metadata.
 */
export function extractMetadata(html) {
  if (!html) {
    return { title: '', description: '', emails: [], phones: [] };
  }

  const $ = cheerio.load(html);
  
  // Extract Title
  const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';

  // Extract Description
  const description = $('meta[name="description"]').attr('content')?.trim() || 
                      $('meta[property="og:description"]').attr('content')?.trim() || '';

  // Extract Raw Text for Regex Search
  const bodyText = $.text();

  // Extract Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = Array.from(new Set(bodyText.match(emailRegex) || [])).slice(0, 10);

  // Extract Phones
  const phoneRegex = /(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/g;
  const phones = Array.from(new Set(bodyText.match(phoneRegex) || [])).slice(0, 10);

  return {
    title,
    description,
    emails,
    phones
  };
}
