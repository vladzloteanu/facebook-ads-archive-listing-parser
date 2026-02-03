// Router for handling Facebook Ads Archive pages
import { createCheerioRouter, Dataset, log } from 'crawlee';

export const router = createCheerioRouter();

/**
 * Default handler for Facebook Ads Archive URLs
 *
 * This handler extracts:
 * - Ad ID from URL
 * - Advertiser name
 * - Ad creative (image or video URL)
 * - Call-to-action URL (destination link)
 * - Ad copy/text
 * - Library ID
 * - Sponsored status
 */
router.addDefaultHandler(async ({ request, $, log: requestLog }) => {
    requestLog.info(`Processing ad: ${request.url}`);

    // Initialize result object with basic information
    const result = {
        // Store the original URL for reference
        ad_archive_url: request.url,
        // Extract timestamp for when this was crawled
        crawled_at: new Date().toISOString(),
    };

    try {
        // Extract Ad ID from URL
        // Format: ?id=1234567890&access_token=...
        const adIdMatch = request.url.match(/[?&]id=(\d+)/);
        if (adIdMatch) {
            result.ad_id = adIdMatch[1];
            requestLog.debug(`Extracted Ad ID: ${result.ad_id}`);
        } else {
            requestLog.warning('Could not extract Ad ID from URL');
            result.ad_id = null;
        }

        // Get the full page HTML for regex-based extraction
        // Facebook's ads archive includes JSON data in the HTML
        const bodyHtml = $('body').html() || '';

        // Extract advertiser name
        // Look for text patterns that indicate advertiser
        const advertiserName = $('a[href*="facebook.com/"] span').first().text().trim();
        if (advertiserName) {
            result.advertiser_name = advertiserName;
            requestLog.debug(`Extracted advertiser: ${result.advertiser_name}`);
        } else {
            // Fallback: try to find from alt text
            const altText = $('img.img').first().attr('alt');
            result.advertiser_name = altText || 'Unknown';
            requestLog.warning(`Advertiser name not found in expected location, using fallback: ${result.advertiser_name}`);
        }

        // Extract Library ID
        // Format: "Library ID: 1234567890"
        const libraryIdText = $('span:contains("Library ID:")').text();
        const libraryIdMatch = libraryIdText.match(/Library ID:\s*(\d+)/);
        if (libraryIdMatch) {
            result.library_id = libraryIdMatch[1];
            requestLog.debug(`Extracted Library ID: ${result.library_id}`);
        } else {
            requestLog.warning('Could not extract Library ID');
            result.library_id = null;
        }

        // Check if this is a sponsored ad
        result.is_sponsored = $('span:contains("Sponsored")').length > 0;
        requestLog.debug(`Is sponsored: ${result.is_sponsored}`);

        // Extract ad text/copy
        // The ad copy is usually in a div with specific classes
        const adTextElement = $('._7jyr span, ._4ik4._4ik5').filter((i, el) => {
            const text = $(el).text();
            // Filter out short texts that are likely not the main ad copy
            return text.length > 20;
        }).first();

        result.ad_text = adTextElement.text().trim() || null;
        if (result.ad_text) {
            requestLog.debug(`Extracted ad text (${result.ad_text.length} chars)`);
        } else {
            requestLog.warning('Could not extract ad text');
        }

        // Extract creative URL (image or video)
        // Try multiple patterns as Facebook uses different formats

        // Pattern 0a: Look for video src attribute directly (Facebook's current format as of Feb 2026)
        // The video URL is now directly in the <video src="..."> attribute
        const videoSrc = $('video').first().attr('src');
        if (videoSrc && videoSrc.includes('fbcdn')) {
            result.creative_url = videoSrc;
            result.ad_type = 'video';
            requestLog.info(`Found video creative (src attr): ${result.creative_url}`);
        }

        // Pattern 0b: Look for img inside clickable ad link (data-lynx-mode="hover")
        // This is Facebook's current format for image ads as of Feb 2026
        if (!result.creative_url) {
            const adLinkImg = $('a[data-lynx-mode="hover"] img[src*="fbcdn"]').first().attr('src');
            if (adLinkImg && !adLinkImg.includes('60x60')) {
                result.creative_url = adLinkImg;
                result.ad_type = 'image';
                requestLog.info(`Found image creative (lynx-mode link): ${result.creative_url}`);
            }
        }

        // Pattern 0c: Look for img in ad content containers with data-testid
        if (!result.creative_url) {
            const adContentImg = $('[data-testid="ad-content-body-video-container"] img, [data-testid="ad-content-body-image-container"] img').first().attr('src');
            if (adContentImg && adContentImg.includes('fbcdn') && !adContentImg.includes('60x60')) {
                result.creative_url = adContentImg;
                result.ad_type = 'image';
                requestLog.info(`Found image creative (ad-content container): ${result.creative_url}`);
            }
        }

        // Pattern 1: Look for "resized_image_url" in JSON data (legacy format)
        const imageUrlMatches = bodyHtml.match(/"resized_image_url":"([^"]+)"/g);
        if (imageUrlMatches && imageUrlMatches.length > 0) {
            // Get the last match (usually the highest quality)
            const lastMatch = imageUrlMatches[imageUrlMatches.length - 1];
            const urlMatch = lastMatch.match(/"resized_image_url":"([^"]+)"/);
            if (urlMatch) {
                // Unescape the URL (remove backslashes)
                result.creative_url = urlMatch[1].replace(/\\/g, '');
                result.ad_type = 'image';
                requestLog.info(`Found image creative: ${result.creative_url}`);
            }
        }

        // Pattern 2: If no image, try video URLs
        if (!result.creative_url) {
            const videoUrlMatches = bodyHtml.match(/"video_hd_url":"([^"]+)"/g);
            if (videoUrlMatches && videoUrlMatches.length > 0) {
                const lastMatch = videoUrlMatches[videoUrlMatches.length - 1];
                const urlMatch = lastMatch.match(/"video_hd_url":"([^"]+)"/);
                if (urlMatch) {
                    result.creative_url = urlMatch[1].replace(/\\/g, '');
                    result.ad_type = 'video';
                    requestLog.info(`Found video creative: ${result.creative_url}`);
                }
            }
        }

        // Pattern 3: Fallback to img src attribute
        if (!result.creative_url) {
            const imgSrc = $('img[src*="fbcdn"]').not('[src*="60x60"]').first().attr('src');
            if (imgSrc) {
                result.creative_url = imgSrc;
                result.ad_type = 'image';
                requestLog.info(`Found image creative (fallback): ${result.creative_url}`);
            }
        }

        // Pattern 4: Check for video poster
        if (!result.creative_url) {
            const videoPoster = $('video').first().attr('poster');
            if (videoPoster) {
                result.creative_url = videoPoster;
                result.ad_type = 'video_thumbnail';
                requestLog.info(`Found video poster: ${result.creative_url}`);
            }
        }

        // If still no creative URL found
        if (!result.creative_url) {
            requestLog.warning('Could not extract creative URL (image/video)');
            result.creative_url = null;
            result.ad_type = 'unknown';
        }

        // Extract CTA (Call-to-Action) URL / destination link
        // Pattern 1: Look for "link_url" in JSON data
        const linkUrlMatches = bodyHtml.match(/"link_url":"([^"]+)"/g);
        if (linkUrlMatches && linkUrlMatches.length > 0) {
            const lastMatch = linkUrlMatches[linkUrlMatches.length - 1];
            const urlMatch = lastMatch.match(/"link_url":"([^"]+)"/);
            if (urlMatch) {
                result.cta_url = urlMatch[1].replace(/\\/g, '');
                requestLog.info(`Found CTA URL: ${result.cta_url}`);
            }
        }

        // Pattern 2: Look for links with l.facebook.com redirect
        if (!result.cta_url) {
            const redirectLink = $('a[href*="l.facebook.com/l.php"]').first().attr('href');
            if (redirectLink) {
                // Extract the actual URL from the redirect
                try {
                    const urlObj = new URL(redirectLink);
                    const targetUrl = urlObj.searchParams.get('u');
                    if (targetUrl) {
                        result.cta_url = targetUrl;
                        requestLog.info(`Found CTA URL (from redirect): ${result.cta_url}`);
                    }
                } catch (e) {
                    requestLog.warning(`Failed to parse redirect URL: ${e.message}`);
                }
            }
        }

        // Pattern 3: Look for direct external links
        if (!result.cta_url) {
            const externalLink = $('a[href^="http"]').not('[href*="facebook.com"]').first().attr('href');
            if (externalLink) {
                result.cta_url = externalLink;
                requestLog.info(`Found CTA URL (direct link): ${result.cta_url}`);
            }
        }

        // If still no CTA URL found
        if (!result.cta_url) {
            requestLog.warning('Could not extract CTA URL');
            result.cta_url = null;
        }

        // Extract CTA button text (e.g., "Learn More", "Shop Now")
        const ctaButton = $('div[role="button"]:contains("Learn"), div[role="button"]:contains("Shop"), div[role="button"]:contains("More")').first();
        result.cta_text = ctaButton.text().trim() || null;
        if (result.cta_text) {
            requestLog.debug(`Found CTA text: ${result.cta_text}`);
        }

        // Extract domain from CTA URL for easier filtering
        if (result.cta_url) {
            try {
                const urlObj = new URL(result.cta_url);
                result.cta_domain = urlObj.hostname.replace('www.', '');
                requestLog.debug(`Extracted CTA domain: ${result.cta_domain}`);
            } catch (e) {
                requestLog.warning(`Failed to parse CTA URL domain: ${e.message}`);
                result.cta_domain = null;
            }
        }

        // Mark as successfully processed
        result.status = 'SUCCESS';

        // Log summary of extracted data
        requestLog.info('Successfully processed ad', {
            ad_id: result.ad_id,
            advertiser: result.advertiser_name,
            ad_type: result.ad_type,
            has_creative: !!result.creative_url,
            has_cta: !!result.cta_url,
            library_id: result.library_id,
        });

        // Save the result to Dataset
        await Dataset.pushData(result);

    } catch (error) {
        // Handle any errors during parsing
        requestLog.error('Error processing ad', {
            url: request.url,
            error: error.message,
            stack: error.stack,
        });

        // Save error information
        result.status = 'ERROR';
        result.error = error.message;
        result.error_stack = error.stack;

        await Dataset.pushData(result);
    }
});
