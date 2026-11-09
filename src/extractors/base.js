/**
 * Base extractor utilities working with Cheerio ($).
 */

/**
 * Clean and normalize text extracted from DOM nodes.
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

/**
 * Extract standard meta tags and OpenGraph/Twitter attributes from Cheerio instance.
 * @param {import('cheerio').CheerioAPI} $
 * @returns {Record<string, string>}
 */
export function extractMetaTags($) {
  const meta = {};

  // Standard metadata
  meta.title = cleanText($('title').first().text());
  meta.description = $('meta[name="description"]').attr('content') || '';
  meta.keywords = $('meta[name="keywords"]').attr('content') || '';
  meta.canonical = $('link[rel="canonical"]').attr('href') || '';
  meta.robots = $('meta[name="robots"]').attr('content') || '';

  // Open Graph
  meta.ogTitle = $('meta[property="og:title"]').attr('content') || '';
  meta.ogDescription = $('meta[property="og:description"]').attr('content') || '';
  meta.ogImage = $('meta[property="og:image"]').attr('content') || '';
  meta.ogUrl = $('meta[property="og:url"]').attr('content') || '';
  meta.ogSiteName = $('meta[property="og:site_name"]').attr('content') || '';

  // Twitter
  meta.twitterCard = $('meta[name="twitter:card"]').attr('content') || '';
  meta.twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';

  return meta;
}

