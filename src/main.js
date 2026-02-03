// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
// Crawlee - web scraping and browser automation library (Read more at https://crawlee.dev)
import { CheerioCrawler, log } from 'crawlee';
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
    maxConcurrency = 5,
    requestTimeout = 30000,
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

// Configure proxy with RESIDENTIAL proxies to avoid Facebook blocking
const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
});

log.info('Proxy configuration created', {
    proxyUrl: proxyConfiguration ? 'enabled (RESIDENTIAL)' : 'disabled',
});

/**
 * Initialize the CheerioCrawler
 *
 * CheerioCrawler is faster and cheaper than Playwright/Puppeteer
 * Using residential proxies to avoid Facebook blocking
 */
const crawler = new CheerioCrawler({
    // Use RESIDENTIAL proxy to avoid blocking
    proxyConfiguration,

    // Maximum number of concurrent requests
    maxConcurrency,

    // Timeout for each request in milliseconds
    requestHandlerTimeoutSecs: requestTimeout / 1000,

    // Use the router defined in routes.js
    requestHandler: router,

    // Retry failed requests up to 3 times with exponential backoff
    maxRequestRetries: 3,

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
await Actor.exit();
