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
    maxConcurrency = 15,  // Higher concurrency for speed
    requestTimeout = 20000,  // Aggressive: 20s timeout
    maxRetries = 1,  // Minimal retries
    proxyType = 'DEFAULT',  // DEFAULT proxy by default (cheaper)
} = input;

if (!Array.isArray(startUrls) || startUrls.length === 0) {
    log.error('startUrls must be a non-empty array');
    throw new Error('startUrls is required and must contain at least one URL');
}

log.info('Actor configuration', {
    urlCount: startUrls.length,
    maxConcurrency,
    requestTimeout,
    proxyType,
});

// Get proxy configuration
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

// Build crawler options - aggressively optimized for cost
const crawlerOptions = {
    maxConcurrency,
    requestHandlerTimeoutSecs: requestTimeout / 1000,
    requestHandler: router,
    maxRequestRetries: maxRetries,
    navigationTimeoutSecs: 15,  // Aggressive navigation timeout

    launchContext: {
        launchOptions: {
            headless: true,
            args: [
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-extensions',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--disable-background-timer-throttling',
                '--disable-client-side-phishing-detection',
                '--disable-hang-monitor',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--disable-domain-reliability',
                '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process',
                '--js-flags=--max-old-space-size=256',  // Limit JS memory
            ],
        },
    },

    // Session pooling for browser reuse
    useSessionPool: true,
    sessionPoolOptions: {
        maxPoolSize: maxConcurrency,
        sessionOptions: {
            maxUsageCount: 50,  // Reuse session up to 50 times
        },
    },

    preNavigationHooks: [
        async ({ page }) => {
            // Minimal viewport
            await page.setViewportSize({ width: 800, height: 600 });

            // Aggressive resource blocking
            await page.route('**/*', (route) => {
                const request = route.request();
                const resourceType = request.resourceType();
                const url = request.url();

                // Block everything except document, script, xhr, fetch
                if (['image', 'stylesheet', 'font', 'media', 'websocket', 'manifest', 'other'].includes(resourceType)) {
                    return route.abort();
                }

                // Block tracking and analytics scripts
                if (url.includes('analytics') || url.includes('tracking') ||
                    url.includes('pixel') || url.includes('beacon') ||
                    url.includes('doubleclick') || url.includes('googletag')) {
                    return route.abort();
                }

                return route.continue();
            });
        },
    ],

    failedRequestHandler: async ({ request, error }) => {
        log.warning(`Request failed: ${request.url.match(/id=(\d+)/)?.[1]} - ${error.message}`);
        await Actor.pushData({
            status: 'FAILED',
            url: request.url,
            ad_id: request.url.match(/id=(\d+)/)?.[1],
            error: error.message,
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
log.info(`Starting crawler with ${startUrls.length} URLs...`);

try {
    await crawler.run(startUrls);
    const duration = (Date.now() - startTime) / 1000;
    log.info(`Finished in ${duration.toFixed(1)}s (${(duration / startUrls.length).toFixed(2)}s/URL)`);
} catch (error) {
    log.error('Crawler failed', { error: error.message });
    throw error;
}

const stats = await crawler.stats.state;
log.info('Stats', {
    finished: stats.requestsFinished,
    failed: stats.requestsFailed,
});

await Actor.exit();
