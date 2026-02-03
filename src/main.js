// Apify SDK - toolkit for building Apify Actors (Read more at https://docs.apify.com/sdk/js/)
import { Actor } from 'apify';
// Crawlee - web scraping and browser automation library (Read more at https://crawlee.dev)
import { PlaywrightCrawler, log } from 'crawlee';
import { router } from './routes.js';

// Initialize the Actor environment
await Actor.init();

// Get and validate input
const input = await Actor.getInput();

if (!input) {
    log.error('No input provided!');
    throw new Error('Input is required. Please provide startUrls and other configuration.');
}

const {
    startUrls = [],
    maxConcurrency = 3,
    requestTimeout = 60000,
} = input;

if (!Array.isArray(startUrls) || startUrls.length === 0) {
    log.error('startUrls must be a non-empty array');
    throw new Error('startUrls is required and must contain at least one URL');
}

log.info('Actor configuration', {
    urlCount: startUrls.length,
    maxConcurrency,
    requestTimeout,
});

// Get proxy configuration from input (allows testing different proxy types)
const { proxyType = 'RESIDENTIAL' } = input;

let proxyConfiguration = null;
if (proxyType === 'RESIDENTIAL') {
    proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['RESIDENTIAL'],
    });
} else if (proxyType === 'DATACENTER') {
    proxyConfiguration = await Actor.createProxyConfiguration({
        groups: ['DATACENTER'],
    });
} else if (proxyType === 'DEFAULT') {
    proxyConfiguration = await Actor.createProxyConfiguration();
} else if (proxyType === 'NONE') {
    proxyConfiguration = null;
}

log.info('Proxy configuration created', {
    proxyType,
    proxyUrl: proxyConfiguration ? 'enabled' : 'disabled',
});

// Build crawler options - only include proxyConfiguration if set
const crawlerOptions = {
    maxConcurrency,
    requestHandlerTimeoutSecs: requestTimeout / 1000,
    requestHandler: router,
    maxRequestRetries: 3,

    launchContext: {
        launchOptions: {
            headless: true,
        },
    },

    preNavigationHooks: [
        async ({ page }) => {
            await page.setViewportSize({ width: 1280, height: 800 });

            // Block unnecessary resources to reduce bandwidth
            await page.route('**/*', (route) => {
                const resourceType = route.request().resourceType();
                // Allow document, script, xhr, fetch - block images, fonts, stylesheets, media
                if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                    route.abort();
                } else {
                    route.continue();
                }
            });
        },
    ],

    failedRequestHandler: async ({ request, error }, context) => {
        log.error(`Request failed after ${request.retryCount} retries`, {
            url: request.url,
            error: error.message,
            adId: request.url.match(/id=(\d+)/)?.[1],
        });

        await Actor.pushData({
            status: 'FAILED',
            url: request.url,
            error: error.message,
            retryCount: request.retryCount,
            timestamp: new Date().toISOString(),
        });
    },
};

// Only add proxy if configured
if (proxyConfiguration) {
    crawlerOptions.proxyConfiguration = proxyConfiguration;
}

const crawler = new PlaywrightCrawler(crawlerOptions);

const startTime = Date.now();

log.info('Starting crawler...', {
    totalUrls: startUrls.length,
    startTime: new Date(startTime).toISOString(),
});

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

const stats = await crawler.stats.state;
log.info('Final crawler statistics', {
    requestsFinished: stats.requestsFinished,
    requestsFailed: stats.requestsFailed,
    retryHistogram: stats.retryHistogram,
});

await Actor.exit();
