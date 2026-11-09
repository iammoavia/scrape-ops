import { cleanText, extractMetaTags } from './base.js';

/**
 * Site-specific extractor for Fragrantica pages.
 * Supports:
 * - Part 1: Notes catalog page (https://www.fragrantica.com/notes/) & individual note pages
 * - Part 2: Fragrance/perfume detail pages (setup for expansion)
 * - Homepage & generic pages
 */
export class FragranticaExtractor {
  /**
   * @param {import('cheerio').CheerioAPI} $
   * @param {string} url
   */
  static extract($, url) {
    const meta = extractMetaTags($);
    const pageType = FragranticaExtractor.detectPageType(url, $);

    const result = {
      url,
      pageType,
      title: meta.title,
      description: meta.description,
      canonical: meta.canonical,
      metadata: meta,
      extractedAt: new Date().toISOString(),
      content: {},
    };

    if (pageType === 'notes') {
      result.content = FragranticaExtractor.extractNotesListing($, url);
    } else if (pageType === 'note_detail') {
      result.content = FragranticaExtractor.extractNoteDetailPage($, url);
    } else if (pageType === 'perfume') {
      result.content = FragranticaExtractor.extractPerfumePage($, url);
    } else if (pageType === 'homepage') {
      result.content = FragranticaExtractor.extractHomepage($);
    } else {
      result.content = FragranticaExtractor.extractGenericPage($);
    }

    return result;
  }

  /**
   * Identifies the category of Fragrantica page based on URL and structure.
   */
  static detectPageType(url, $) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();

      if (path === '/' || path === '') return 'homepage';

      // Distinguish notes catalog listing from note detail page
      if (path === '/notes' || path === '/notes/') return 'notes';
      if (path.startsWith('/notes/') && path.endsWith('.html')) return 'note_detail';

      if (path.includes('/perfume/')) return 'perfume';
      if (path.includes('/designers/')) return 'designer';
      if (path.includes('/news/')) return 'news';

      // Fallback check on DOM structure if URL is rewritten/relative
      if ($('a[href*="/notes/"][href$=".html"]').length > 50) {
        return 'notes';
      }

      return 'generic';
    } catch {
      return 'generic';
    }
  }

  /**
   * Part 1: Extracts fragrance notes from the main notes catalog page:
   * https://www.fragrantica.com/notes/
   *
   * Analyzes HTML to capture:
   * - name: Note name (e.g., Bergamot)
   * - link: Full canonical URL to note page for future detail scraping
   * - image: Note picture URL
   * - group: Fragrance family group (e.g., CITRUS SMELLS, FLOWERS)
   * - slug & noteId: Identifier tokens
   *
   * Deduplicates by link to ensure unique storage.
   */
  static extractNotesListing($, baseUrl = 'https://www.fragrantica.com') {
    const notesMap = new Map();
    const groups = [];

    // Fragrantica organizes notes by category sections with sticky headers
    $('div.sticky').each((_, stickyEl) => {
      const groupName = cleanText($(stickyEl).find('h2').text());
      if (!groupName) return;

      const wFull = $(stickyEl).nextAll('div.w-full').first();
      let groupCount = 0;

      wFull.find('a[href*="/notes/"]').each((_, aEl) => {
        let href = $(aEl).attr('href') || '';
        if (!href || href === '/notes/' || !href.includes('.html')) return;

        // Ensure absolute link
        if (href.startsWith('/')) {
          href = `${baseUrl.replace(/\/$/, '')}${href}`;
        }

        const name = cleanText($(aEl).find('p').text()) || cleanText($(aEl).find('img').attr('alt')) || cleanText($(aEl).text());
        const imgEl = $(aEl).find('img');
        const image = imgEl.attr('src') || imgEl.attr('data-src') || '';

        // Extract slug and ID from URL (e.g. /notes/Bergamot-75.html -> Bergamot, 75)
        const match = href.match(/\/notes\/([^/]+)-(\d+)\.html/);
        const slug = match ? match[1] : '';
        const noteId = match ? parseInt(match[2], 10) : null;

        if (!notesMap.has(href)) {
          notesMap.set(href, {
            name,
            link: href,
            image,
            group: groupName,
            slug,
            noteId,
          });
          groupCount++;
        }
      });

      groups.push({
        name: groupName,
        count: groupCount,
      });
    });

    // Fallback pass: find any note anchors with .html that may sit outside sticky sections
    $('a[href*="/notes/"]').each((_, aEl) => {
      let href = $(aEl).attr('href') || '';
      if (!href || href === '/notes/' || !href.includes('.html')) return;
      if (href.startsWith('/')) {
        href = `${baseUrl.replace(/\/$/, '')}${href}`;
      }

      if (!notesMap.has(href)) {
        const name = cleanText($(aEl).find('p').text()) || cleanText($(aEl).find('img').attr('alt')) || cleanText($(aEl).text());
        const imgEl = $(aEl).find('img');
        const image = imgEl.attr('src') || imgEl.attr('data-src') || '';
        const match = href.match(/\/notes\/([^/]+)-(\d+)\.html/);

        notesMap.set(href, {
          name,
          link: href,
          image,
          group: 'UNCATEGORIZED',
          slug: match ? match[1] : '',
          noteId: match ? parseInt(match[2], 10) : null,
        });
      }
    });

    const notes = Array.from(notesMap.values());

    return {
      totalNotes: notes.length,
      totalGroups: groups.length,
      groups,
      notes,
      sampleNotes: notes.slice(0, 10),
    };
  }

  /**
   * Detail page extractor for individual notes (e.g. https://www.fragrantica.com/notes/Bergamot-75.html).
   * Ready for expanding the scraper to crawl the saved note links.
   */
  static extractNoteDetailPage($, url) {
    const heading = cleanText($('h1').first().text());
    const description = cleanText($('div[itemprop="description"], .wiki-content, p.leading-relaxed').first().text());
    const imgEl = $('img[src*="/sastojci/"]').first();
    const image = imgEl.attr('src') || '';

    // Collect featured perfumes discovered on the note's page
    const featuredPerfumes = [];
    $('a[href*="/perfume/"]').each((_, el) => {
      const href = $(el).attr('href');
      const perfumeName = cleanText($(el).text());
      if (href && href.endsWith('.html') && perfumeName) {
        featuredPerfumes.push({
          name: perfumeName,
          link: href.startsWith('http') ? href : `https://www.fragrantica.com${href}`,
        });
      }
    });

    return {
      name: heading,
      url,
      image,
      description,
      featuredPerfumesCount: featuredPerfumes.length,
      featuredPerfumesPreview: featuredPerfumes.slice(0, 5),
    };
  }

  /**
   * Part 2: Fragrance detail page extractor setup.
   * Keeps fragrance extraction structure ready for Part 2 expansion.
   */
  static extractPerfumePage($, url) {
    const mainHeading = cleanText($('h1').first().text());
    const brand = cleanText($('span[itemprop="name"]').first().text()) || cleanText($('a[href*="/designers/"]').first().text());
    const ratingValue = parseFloat($('span[itemprop="ratingValue"]').text()) || null;
    const ratingCount = parseInt($('span[itemprop="ratingCount"]').text(), 10) || null;
    const description = cleanText($('div[itemprop="description"]').text());
    const mainImage = $('img[itemprop="image"]').attr('src') || $('img[src*="/perfume/"]').attr('src') || '';

    // Extract fragrance accords
    const accords = [];
    $('.accord-box').each((_, el) => {
      const accordName = cleanText($(el).text());
      if (accordName) accords.push(accordName);
    });

    // Extract pyramid notes if present
    const pyramid = {
      top: [],
      middle: [],
      base: [],
    };

    $('div:contains("Top Notes")').nextAll('a[href*="/notes/"]').each((_, el) => {
      const t = cleanText($(el).text());
      if (t) pyramid.top.push(t);
    });

    return {
      perfumeName: mainHeading,
      brand,
      link: url,
      image: mainImage,
      rating: ratingValue,
      votesCount: ratingCount,
      description,
      accords,
      pyramid,
    };
  }

  /**
   * Homepage specific extractor: gathers spotlight articles, trending items, sample perfume links.
   */
  static extractHomepage($) {
    const newsHeadlines = [];
    $('h1, h2, h3').each((_, el) => {
      const text = cleanText($(el).text());
      if (text && text.length > 5 && text.length < 150) {
        newsHeadlines.push(text);
      }
    });

    // Collect fragrance preview links discovered on the homepage
    const perfumeLinks = new Set();
    $('a[href*="/perfume/"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && href.endsWith('.html')) {
        const fullUrl = href.startsWith('http') ? href : `https://www.fragrantica.com${href}`;
        perfumeLinks.add(fullUrl);
      }
    });

    return {
      headlinesPreview: newsHeadlines.slice(0, 10),
      totalPerfumeLinksFound: perfumeLinks.size,
      samplePerfumeUrls: Array.from(perfumeLinks).slice(0, 5),
      totalPageLinks: $('a').length,
      totalImages: $('img').length,
    };
  }

  /**
   * Fallback generic page extractor.
   */
  static extractGenericPage($) {
    return {
      headings: $('h1, h2').map((_, el) => cleanText($(el).text())).get().filter(Boolean).slice(0, 5),
      totalLinks: $('a').length,
      totalParagraphs: $('p').length,
    };
  }
}
