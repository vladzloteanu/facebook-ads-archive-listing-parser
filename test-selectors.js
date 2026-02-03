import * as cheerio from 'cheerio';
import { readFileSync } from 'fs';

// Load the test HTML
const html = readFileSync('/Users/vlad.zloteanu/wrk/dolead/adsinsights/tmp/html_content.html', 'utf-8');
const $ = cheerio.load(html);

console.log('=== Testing Cheerio Selectors ===\n');

// Pattern 0a: video src
const videoSrc = $('video').first().attr('src');
console.log('Pattern 0a - video src:', videoSrc ? videoSrc.substring(0, 80) + '...' : 'NOT FOUND');
console.log('  includes fbcdn:', videoSrc?.includes('fbcdn'));

// Pattern 0b: a[data-lynx-mode="hover"] img
const adLinkImg = $('a[data-lynx-mode="hover"] img[src*="fbcdn"]').first().attr('src');
console.log('\nPattern 0b - lynx-mode img:', adLinkImg ? adLinkImg.substring(0, 80) + '...' : 'NOT FOUND');

// Pattern 0c: data-testid containers
const adContentImg = $('[data-testid="ad-content-body-video-container"] img, [data-testid="ad-content-body-image-container"] img').first().attr('src');
console.log('\nPattern 0c - data-testid img:', adContentImg ? adContentImg.substring(0, 80) + '...' : 'NOT FOUND');

// Check what elements exist
console.log('\n=== Element counts ===');
console.log('video elements:', $('video').length);
console.log('a[data-lynx-mode="hover"]:', $('a[data-lynx-mode="hover"]').length);
console.log('[data-testid="ad-content-body-video-container"]:', $('[data-testid="ad-content-body-video-container"]').length);

// Test the actual logic
let creative_url = null;
let ad_type = 'unknown';

if (videoSrc && videoSrc.includes('fbcdn')) {
    creative_url = videoSrc;
    ad_type = 'video';
    console.log('\n✓ Would extract video from Pattern 0a');
}

if (!creative_url && adLinkImg && !adLinkImg.includes('60x60')) {
    creative_url = adLinkImg;
    ad_type = 'image';
    console.log('\n✓ Would extract image from Pattern 0b');
}

console.log('\n=== Final Result ===');
console.log('creative_url:', creative_url ? creative_url.substring(0, 100) + '...' : null);
console.log('ad_type:', ad_type);
