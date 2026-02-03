// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
// Crawlee - web scraping and browser automation library (Read more at https://crawlee.dev)
import { PlaywrightCrawler, log } from 'crawlee';
import { router } from './routes.js';

// Initialize the Actor environment
// This configures logging, storage, and other Actor-specific features
await Actor.init();

/**
 * Main Actor execution
 *
 * This Actor crawls Facebook Ads Archive URLs and extracts:
 * - Ad ID
 * - Advertiser information
 * - Ad creative (image/video URLs)
 * - Call-to-action URLs
 * - Ad text/copy
 * - Library ID
 */

// Get and validate input
const input = await Actor.getInput();

// Validate that input exists
if (!input) {
    log.error('No input provided!');
    throw new Error('Input is required. Please provide startUrls and other configuration.');
}

// Extract configuration with defaults
const {
    startUrls = [],
    maxConcurrency = 3,  // Lower default for browser-based crawling
    requestTimeout = 60000,  // Longer timeout for JS rendering
} = input;

// Validate startUrls
if (!Array.isArray(startUrls) || startUrls.length === 0) {
    log.error('startUrls must be a non-empty array');
    throw new Error('startUrls is required and must contain at least one URL');
}

log.info('Actor configuration', {
    urlCount: startUrls.length,
    maxConcurrency,
    requestTimeout,
});

// Validate URL format for each URL
for (const url of startUrls) {
    if (!url.includes('facebook.com/ads/archive/render_ad/')) {
        log.warning(`Invalid URL format: ${url}`);
        log.warning('Expected format: https://www.facebook.com/ads/archive/render_ad/?id=XXXXX&access_token=XXXXX');
    }
}

// Configure proxy to avoid rate limiting and blocking
// Facebook may block requests without proper proxy rotation
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
});

log.info('Proxy configuration created', {
    proxyUrl: proxyConfiguration ? 'enabled (residential)' : 'disabled',
});

/**
 * Initialize the PlaywrightCrawler
 *
 * PlaywrightCrawler uses a real browser to execute JavaScript,
 * which is required for Facebook's dynamically rendered ad content
 */
const crawler = new PlaywrightCrawler({
    // Use proxy to rotate IPs and avoid blocking
    proxyConfiguration,

    // Maximum number of concurrent browser pages
    maxConcurrency,

    // Timeout for each request in milliseconds
    requestHandlerTimeoutSecs: requestTimeout / 1000,

    // Use the router defined in routes.js
    requestHandler: router,

    // Retry failed requests up to 3 times with exponential backoff
    maxRequestRetries: 3,

    // Browser launch options
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },

    // Wait for content to load before processing
    preNavigationHooks: [
        async ({ page }) => {
            // Set a realistic viewport
            await page.setViewportSize({ width: 1280, height: 800 });
        },
    ],

    // Custom error handler for better logging
    failedRequestHandler: async ({ request, error }, context) => {
        log.error(`Request failed after ${request.retryCount} retries`, {
            url: request.url,
            error: error.message,
            adId: request.url.match(/id=(\d+)/)?.[1],
        });

        // Save failed URLs for later analysis
        await Actor.pushData({
            status: 'FAILED',
            url: request.url,
            error: error.message,
            retryCount: request.retryCount,
            timestamp: new Date().toISOString(),
        });
    },
});

// Log crawler statistics periodically
let processedCount = 0;
const startTime = Date.now();

log.info('Starting crawler...', {
    totalUrls: startUrls.length,
    startTime: new Date(startTime).toISOString(),
});

/**
 * Run the crawler with all start URLs
 *
 * The crawler will:
 * 1. Fetch each URL with proxy rotation
 * 2. Wait for JavaScript to render the content
 * 3. Parse the HTML with Cheerio
 * 4. Extract ad data using routes.js
 * 5. Save results to Dataset
 * 6. Handle errors and retries automatically
 */
try {
    await crawler.run(startUrls);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    log.info('Crawler finished successfully', {
        totalUrls: startUrls.length,
        duration: `${duration.toFixed(2)}s`,
        avgTimePerUrl: `${(duration / startUrls.length).toFixed(2)}s`,
        endTime: new Date(endTime).toISOString(),
    });
} catch (error) {
    log.error('Crawler failed with error', {
        error: error.message,
        stack: error.stack,
    });
    throw error;
}

// Get final statistics from the crawler
const stats = await crawler.stats.state;
log.info('Final crawler statistics', {
    requestsFinished: stats.requestsFinished,
    requestsFailed: stats.requestsFailed,
    retryHistogram: stats.retryHistogram,
});

// Gracefully exit the Actor
// This ensures all data is saved and resources are cleaned up
await Actor.exit();
