import process from 'node:process';

/**
 * Truncates text to a maximum length (in characters).
 * 
 * @param {string} text 
 * @param {number} maxLength 
 * @returns {string}
 */
function truncateText(text, maxLength = 6000) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength);
}

/**
 * Clean LLM JSON response by removing any markdown wrappers.
 * E.g., ```json ... ```
 * 
 * @param {string} rawResponse 
 * @returns {any} Parsed JSON or rawResponse string.
 */
function parseJsonSafe(rawResponse) {
  const trimmed = rawResponse.trim();
  
  // Try direct parsing first
  try {
    return JSON.parse(trimmed);
  } catch (_) {}

  // Try extracting from markdown JSON codeblocks if present
  const markdownJsonRegex = /```json\s*([\s\S]*?)\s*```/;
  const match = trimmed.match(markdownJsonRegex);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim());
    } catch (_) {}
  }

  // Try general markdown block fallback
  const genericCodeBlockRegex = /```\s*([\s\S]*?)\s*```/;
  const genericMatch = trimmed.match(genericCodeBlockRegex);
  if (genericMatch && genericMatch[1]) {
    try {
      return JSON.parse(genericMatch[1].trim());
    } catch (_) {}
  }

  // Return raw string if we cannot parse as JSON
  return trimmed;
}

/**
 * Send scraped content and prompt to NVIDIA NIM chat completions.
 * 
 * @param {string} scrapedText Cleaned text from URL.
 * @param {string} userPrompt Instruction for AI enrichment.
 * @returns {Promise<{ enriched_data: any, enrichment_error: string | null }>}
 */
export async function enrichWithNvidiaNim(scrapedText, userPrompt) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return {
      enriched_data: null,
      enrichment_error: 'NVIDIA_API_KEY environment variable is not configured.'
    };
  }

  const modelName = process.env.NVIDIA_MODEL || 'nvidia/llama-3.1-nemotron-ultra-253b-v1';
  const truncatedText = truncateText(scrapedText, 6000);

  const requestBody = {
    model: modelName,
    messages: [
      {
        role: 'system',
        content: 'You are a structured data extraction assistant. Return only valid JSON. No explanation.'
      },
      {
        role: 'user',
        content: `${userPrompt}\n\n[SCRAPED TEXT]:\n${truncatedText}`
      }
    ],
    temperature: 0.1,
    max_tokens: 1024
  };

  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status !== 200) {
      let errorDetail = '';
      try {
        const errText = await response.text();
        errorDetail = `: ${errText}`;
      } catch (_) {}
      return {
        enriched_data: null,
        enrichment_error: `NVIDIA NIM API returned status code ${response.status}${errorDetail}`
      };
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    
    if (!content) {
      return {
        enriched_data: null,
        enrichment_error: 'NVIDIA NIM API response choices list was empty or invalid.'
      };
    }

    const enriched_data = parseJsonSafe(content);
    return {
      enriched_data,
      enrichment_error: null
    };

  } catch (err) {
    console.error('[NVIDIA NIM] Error during chat completion API call:', err);
    return {
      enriched_data: null,
      enrichment_error: `NVIDIA NIM communication failed: ${err.message}`
    };
  }
}
