# Facebook Ads Archive Crawler - Development Notes

## Project Overview

This Apify Actor crawls Facebook Ads Archive URLs to extract advertising data including creatives, CTAs, and metadata. Built with Crawlee and Cheerio for high-performance web scraping.

## Architecture

### Core Components

1. **src/main.js** - Main orchestration
   - Initializes Apify Actor environment
   - Validates input configuration
   - Sets up proxy rotation for avoiding rate limits
   - Configures CheerioCrawler with concurrency controls
   - Handles errors and retries (max 3 retries with exponential backoff)
   - Collects and logs statistics

2. **src/routes.js** - Parsing logic
   - Cheerio-based HTML parsing (faster than browser automation)
   - Multiple extraction patterns for robustness
   - Handles both image and video creatives
   - Extracts from embedded JSON in HTML body
   - Defensive programming with fallbacks

3. **.actor/input_schema.json** - Input validation
   - Defines required fields: `startUrls`
   - Optional: `maxConcurrency` (1-50, default: 5)
   - Optional: `requestTimeout` (5000-120000ms, default: 30000)
   - URL validation regex for Facebook Ads Archive format

4. **.actor/actor.json** - Actor metadata
   - Defines output dataset schema
   - Configures dataset views for Apify platform UI

## Data Extraction Strategy

### Creative URLs (Images/Videos)

**Priority order:**
1. JSON pattern: `"resized_image_url":"..."` (last match = highest quality)
2. JSON pattern: `"video_hd_url":"..."` for video ads
3. Fallback: `<img src="...fbcdn...">` (excluding small thumbnails)
4. Fallback: `<video poster="...">` for video thumbnails

**Why multiple patterns?**
- Facebook's HTML structure varies by ad type and region
- Embedded JSON is most reliable but may be absent
- Fallbacks ensure maximum extraction success rate

### CTA URLs (Call-to-Action Links)

**Priority order:**
1. JSON pattern: `"link_url":"..."` in body HTML
2. Facebook redirect: `l.facebook.com/l.php?u=...` (extract `u` param)
3. Direct external links: `<a href="http...">` excluding facebook.com

**URL cleaning:**
- Remove backslashes from JSON strings
- Decode URL parameters for redirects
- Extract domain for easy filtering (`cta_domain` field)

### Text Extraction

- Targets: `._7jyr span`, `._4ik4._4ik5` classes
- Filters: Only text >20 chars (avoids UI labels)
- Returns: First matching element

### Metadata

- **Ad ID**: Extracted from URL query param `?id=...`
- **Library ID**: Parsed from text "Library ID: XXXXX"
- **Advertiser**: From link text or image alt attribute
- **Sponsored**: Boolean based on presence of "Sponsored" text

## Performance Considerations

### Parallel Processing

```javascript
maxConcurrency: 5  // Process 5 ads simultaneously
```

**Trade-offs:**
- Higher = faster but more memory/CPU usage
- Lower = slower but safer for rate limiting
- Recommended: 3-10 for production

### Request Timeouts

```javascript
requestTimeout: 30000  // 30 seconds per request
```

**Why 30s?**
- Facebook pages can be slow to respond
- Includes proxy connection time
- Balances speed vs. success rate

### Proxy Configuration

```javascript
const proxyConfiguration = await Actor.createProxyConfiguration();
```

**Benefits:**
- Rotates IPs to avoid rate limiting
- Required for production use on Apify platform
- Falls back to no proxy for local development

## Error Handling

### Three-Layer Strategy

1. **Request-level retries**
   ```javascript
   maxRequestRetries: 3
   ```
   - Automatic retry on network errors
   - Exponential backoff between retries

2. **Parser-level try-catch**
   ```javascript
   try {
     // extraction logic
   } catch (error) {
     result.status = 'ERROR';
     result.error = error.message;
   }
   ```
   - Catches parsing errors
   - Saves partial data with error info

3. **Failed request handler**
   ```javascript
   failedRequestHandler: async ({ request, error }) => {
     await Actor.pushData({
       status: 'FAILED',
       url: request.url,
       error: error.message,
     });
   }
   ```
   - Logs all failures
   - Saves failed URLs for later analysis

## Output Schema

```json
{
  "ad_archive_url": "string",      // Original URL
  "crawled_at": "ISO 8601",        // Timestamp
  "ad_id": "string",               // Facebook Ad ID
  "advertiser_name": "string",     // Advertiser/page name
  "library_id": "string",          // Ads Library ID
  "is_sponsored": "boolean",       // Sponsored ad flag
  "ad_text": "string",             // Ad copy/text
  "creative_url": "string",        // Image/video URL
  "ad_type": "image|video|unknown",// Creative type
  "cta_url": "string",             // Call-to-action URL
  "cta_text": "string",            // CTA button text
  "cta_domain": "string",          // Destination domain
  "status": "SUCCESS|ERROR|FAILED" // Processing status
}
```

## Local Development

### Quick Start

```bash
# Install dependencies
npm install

# Run locally
npm start

# Or use Makefile
make run
```

### With Docker

```bash
# Build and run with temporary input
make run_locally

# Or manual Docker build
make build
make run_docker
```

### Input File

Create `storage/key_value_stores/default/INPUT.json`:

```json
{
  "startUrls": [
    "https://www.facebook.com/ads/archive/render_ad/?id=XXXXX&access_token=XXXXX"
  ],
  "maxConcurrency": 5,
  "requestTimeout": 30000
}
```

### View Results

```bash
# JSON format
cat storage/datasets/default/*.json | jq '.'

# Summary view
make view_results
```

## Makefile Commands

```bash
make help            # Show all commands
make install         # Install dependencies
make run             # Run locally without Docker
make run_locally     # Run in Docker with temp input
make build           # Build Docker image
make create_input    # Create sample INPUT.json
make view_results    # View crawled data
make clean           # Clean storage
make lint            # Run linter
make format          # Format code
make push            # Push to Apify platform
make deploy          # Build and deploy
```

## Debugging

### Enable Debug Logs

```bash
# Set log level
export CRAWLEE_LOG_LEVEL=DEBUG
npm start
```

### Check Request Details

The crawler logs:
- Ad ID being processed
- Extraction success/failure for each field
- Final statistics (requests finished/failed)
- Processing time per URL

### Common Issues

**Issue**: "Could not extract creative URL"
- **Cause**: Ad page structure changed or loaded incorrectly
- **Solution**: Check the raw HTML, update extraction patterns

**Issue**: Rate limiting / blocked requests
- **Cause**: Too many requests without proxy
- **Solution**: Enable Apify Proxy or reduce `maxConcurrency`

**Issue**: "Invalid password provided: User not found"
- **Cause**: Running locally without Apify token
- **Solution**: Normal for local dev, proxy disabled automatically

## Production Deployment

### Deploy to Apify Platform

```bash
# Using Makefile
make deploy

# Or manually
apify push
```

### Configure on Platform

1. Set **Memory**: 2048 MB recommended
2. Enable **Apify Proxy**: Required for production
3. Set **Timeout**: 900s (15 min) for large batches
4. Configure **Build**: Uses Dockerfile

### Monitoring

- Check **Log** tab for errors
- Monitor **Dataset** for output
- Review **Statistics** for performance metrics
- Set up **Webhooks** for completion notifications

## Best Practices

### Input Validation

Always validate URLs before crawling:
```bash
# Check URL format
echo $URL | grep -E "facebook.com/ads/archive/render_ad/\?id=[0-9]+&access_token="
```

### Batch Processing

For large URL lists (>1000):
- Split into batches of 500-1000 URLs
- Use multiple Actor runs to avoid timeouts
- Process in parallel for faster completion

### Rate Limiting

Facebook may rate limit based on:
- IP address (use proxy rotation)
- Access token (rotate tokens if available)
- Request frequency (adjust `maxConcurrency`)

### Data Quality

Check output for:
- `status: "SUCCESS"` - Parsing completed
- `creative_url !== null` - Creative extracted
- `cta_url !== null` - CTA link found

Filter failed records:
```bash
cat storage/datasets/default/*.json | jq 'select(.status == "SUCCESS")'
```

## Future Enhancements

### Potential Improvements

1. **Browser-based scraping**
   - Use Playwright for JavaScript-heavy pages
   - Slower but handles dynamic content

2. **Token rotation**
   - Multiple Facebook access tokens
   - Automatic rotation on rate limits

3. **Structured text extraction**
   - Parse ad copy into sentences
   - Extract hashtags and mentions

4. **Media download**
   - Download images/videos locally
   - Upload to cloud storage (S3, etc.)

5. **Change detection**
   - Track ad changes over time
   - Compare multiple crawls

6. **Advanced filtering**
   - Filter by advertiser
   - Filter by ad type
   - Date range filtering

## Dependencies

- **apify**: ^3.4.2 - Apify SDK for Actor runtime
- **crawlee**: ^3.13.8 - Web scraping framework
  - Includes Cheerio for HTML parsing
  - Built-in request queue and storage
  - Automatic retries and error handling

## License

ISC

## Support

For issues or questions:
- Check logs in `storage/` directory
- Review HTML samples in examples above
- Consult Crawlee docs: https://crawlee.dev
- Consult Apify docs: https://docs.apify.com

---

**Last Updated**: 2025-10-28
**Actor Version**: 1.0.0
**Crawlee Version**: 3.13.8
