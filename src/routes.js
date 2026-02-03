// Router for handling Facebook Ads Archive pages
import { createPlaywrightRouter, Dataset, log } from 'crawlee';
import * as cheerio from 'cheerio';

export const router = createPlaywrightRouter();

router.addDefaultHandler(async ({ request, page, log: requestLog }) => {
    requestLog.info(`Processing ad: ${request.url}`);

    const result = {
        ad_archive_url: request.url,
        crawled_at: new Date().toISOString(),
    };

    try {
        const adIdMatch = request.url.match(/[?&]id=(\d+)/);
        if (adIdMatch) {
            result.ad_id = adIdMatch[1];
        } else {
            result.ad_id = null;
        }

        // Wait for content to load
        try {
            await page.waitForSelector('video, img[src*="fbcdn"], [data-testid]', { timeout: 10000 });
        } catch (e) {
            requestLog.warning('Timeout waiting for content selector, proceeding anyway');
        }

        // Check if there's a video element - if so, wait a bit longer for it to load its src
        const hasVideo = await page.$('video');
        if (hasVideo) {
            // Wait for video src to be populated (Facebook loads it lazily)
            try {
                await page.waitForFunction(() => {
                    const video = document.querySelector('video');
                    return video && (video.src || video.querySelector('source')?.src);
                }, { timeout: 5000 });
            } catch (e) {
                requestLog.warning('Video src not populated in time, will try extraction anyway');
            }
        }

        // Short stabilization wait
        await page.waitForTimeout(500);

        const bodyHtml = await page.content();
        const $ = cheerio.load(bodyHtml);

        // DEBUG logging (only in verbose mode)
        requestLog.debug(`HTML length: ${bodyHtml.length}, videos: ${$('video').length}, images: ${$('img[src*="fbcdn"]').length}`);

        // Extract advertiser name
        const advertiserName = $('a[href*="facebook.com/"] span').first().text().trim();
        result.advertiser_name = advertiserName || $('img.img').first().attr('alt') || 'Unknown';

        // Extract Library ID
        const libraryIdText = $('span:contains("Library ID:")').text();
        const libraryIdMatch = libraryIdText.match(/Library ID:\s*(\d+)/);
        result.library_id = libraryIdMatch ? libraryIdMatch[1] : null;

        // Extract creative URL
        // Pattern 1: video src attribute
        const videoSrc = $('video').first().attr('src');
        if (videoSrc && (videoSrc.includes('fbcdn') || videoSrc.includes('facebook'))) {
            result.creative_url = videoSrc;
            result.ad_type = 'video';
            requestLog.info(`Found video creative (src): ${videoSrc.substring(0, 80)}...`);
        }

        // Pattern 2: video source element
        if (!result.creative_url) {
            const videoSourceSrc = $('video source').first().attr('src');
            if (videoSourceSrc && (videoSourceSrc.includes('fbcdn') || videoSourceSrc.includes('facebook'))) {
                result.creative_url = videoSourceSrc;
                result.ad_type = 'video';
                requestLog.info(`Found video creative (source element): ${videoSourceSrc.substring(0, 80)}...`);
            }
        }

        // Pattern 3: Try to extract video URL from page via JavaScript (for lazy-loaded videos)
        if (!result.creative_url) {
            const videoUrl = await page.evaluate(() => {
                const video = document.querySelector('video');
                if (video) {
                    // Check direct src
                    if (video.src && (video.src.includes('fbcdn') || video.src.includes('facebook'))) {
                        return video.src;
                    }
                    // Check source element
                    const source = video.querySelector('source');
                    if (source?.src && (source.src.includes('fbcdn') || source.src.includes('facebook'))) {
                        return source.src;
                    }
                    // Check currentSrc (resolved source)
                    if (video.currentSrc && (video.currentSrc.includes('fbcdn') || video.currentSrc.includes('facebook'))) {
                        return video.currentSrc;
                    }
                }
                return null;
            }).catch(() => null);

            if (videoUrl) {
                result.creative_url = videoUrl;
                result.ad_type = 'video';
                requestLog.info(`Found video creative (JS eval): ${videoUrl.substring(0, 80)}...`);
            }
        }

        // Pattern 4: lynx-mode img
        if (!result.creative_url) {
            const adLinkImg = $('a[data-lynx-mode="hover"] img[src*="fbcdn"]').first().attr('src');
            if (adLinkImg && !adLinkImg.includes('60x60')) {
                result.creative_url = adLinkImg;
                result.ad_type = 'image';
                requestLog.info(`Found image creative (lynx): ${adLinkImg.substring(0, 80)}...`);
            }
        }

        // Pattern 5: fallback img
        if (!result.creative_url) {
            const imgSrc = $('img[src*="fbcdn"]').not('[src*="60x60"]').first().attr('src');
            if (imgSrc) {
                result.creative_url = imgSrc;
                result.ad_type = 'image';
                requestLog.info(`Found image creative (fallback): ${imgSrc.substring(0, 80)}...`);
            }
        }

        // Pattern 6: video poster (last resort - at least get thumbnail)
        if (!result.creative_url) {
            const videoPoster = $('video').first().attr('poster');
            if (videoPoster) {
                result.creative_url = videoPoster;
                result.ad_type = 'video_thumbnail';
                requestLog.info(`Found video poster: ${videoPoster.substring(0, 80)}...`);
            }
        }

        if (!result.creative_url) {
            result.creative_url = null;
            result.ad_type = 'unknown';
            requestLog.warning('Could not extract creative URL');
        }

        // Extract CTA URL
        const redirectLink = $('a[href*="l.facebook.com/l.php"]').first().attr('href');
        if (redirectLink) {
            try {
                const urlObj = new URL(redirectLink);
                result.cta_url = urlObj.searchParams.get('u');
            } catch (e) {}
        }
        if (!result.cta_url) {
            result.cta_url = $('a[href^="http"]').not('[href*="facebook.com"]').first().attr('href') || null;
        }

        result.status = 'SUCCESS';

        requestLog.info('Successfully processed ad', {
            ad_id: result.ad_id,
            advertiser: result.advertiser_name,
            ad_type: result.ad_type,
            has_creative: !!result.creative_url,
        });

        await Dataset.pushData(result);

    } catch (error) {
        requestLog.error('Error processing ad', { error: error.message });
        result.status = 'ERROR';
        result.error = error.message;
        await Dataset.pushData(result);
    }
});
