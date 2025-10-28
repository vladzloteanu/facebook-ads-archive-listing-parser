# Facebook Ads Archive Crawler

[![Apify](https://img.shields.io/badge/Apify-Actor-00ADD8?logo=apify)](https://apify.com)
[![Crawlee](https://img.shields.io/badge/Crawlee-v3.13-orange)](https://crawlee.dev/)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

A high-performance Apify Actor for scraping Facebook Ads Archive data. Extracts ad creatives, CTA links, advertiser information, and metadata from Facebook's Ad Library render URLs.

## Features

✨ **Comprehensive Data Extraction**
- Ad creatives (images and videos)
- Call-to-action URLs and domains
- Advertiser names and Library IDs
- Ad copy/text content
- Sponsored status indicators

🚀 **High Performance**
- Parallel processing with configurable concurrency
- Automatic proxy rotation to avoid rate limiting
- Smart retry mechanism with exponential backoff
- Average processing time: ~200ms per ad

🛡️ **Robust & Defensive**
- Multiple extraction patterns with fallbacks
- Comprehensive error handling
- Detailed logging for debugging
- Graceful degradation on parsing failures

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Run the Actor
npm start

# Or use Makefile for convenience
make run
```

### With Docker

```bash
# Build and run with sample input
make run_locally

# Or manually
docker build -t facebook-ads-crawler .
docker run --rm -v $(pwd)/storage:/app/storage facebook-ads-crawler
```

## Input Configuration

Create `storage/key_value_stores/default/INPUT.json`:

```json
{
  "startUrls": [
    "https://www.facebook.com/ads/archive/render_ad/?id=2500687420313026&access_token=YOUR_TOKEN",
    "https://www.facebook.com/ads/archive/render_ad/?id=1337761321325468&access_token=YOUR_TOKEN"
  ],
  "maxConcurrency": 5,
  "requestTimeout": 30000
}
```

### Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrls` | Array | Yes | - | Facebook Ads Archive URLs to crawl |
| `maxConcurrency` | Integer | No | 5 | Number of parallel requests (1-50) |
| `requestTimeout` | Integer | No | 30000 | Request timeout in milliseconds (5000-120000) |

## Output Schema

Each crawled ad produces a JSON object with the following structure:

```json
{
  "ad_archive_url": "https://www.facebook.com/ads/archive/render_ad/?id=...",
  "crawled_at": "2025-10-28T09:24:24.936Z",
  "ad_id": "2500687420313026",
  "advertiser_name": "Planville GmbH",
  "library_id": "1694019301268032",
  "is_sponsored": true,
  "ad_text": "Die Installation unserer Wärmepumpe? Schneller...",
  "creative_url": "https://scontent-cdg4-2.xx.fbcdn.net/v/t39.35426-6/...",
  "ad_type": "image",
  "cta_url": "https://funnel.planville.de/wp/",
  "cta_text": "Learn More",
  "cta_domain": "funnel.planville.de",
  "status": "SUCCESS"
}
```

### Output Fields

| Field | Type | Description |
|-------|------|-------------|
| `ad_archive_url` | String | Original crawl URL |
| `crawled_at` | ISO 8601 | Timestamp when ad was crawled |
| `ad_id` | String | Facebook Ad ID |
| `advertiser_name` | String | Advertiser/Page name |
| `library_id` | String | Facebook Ads Library ID |
| `is_sponsored` | Boolean | Whether ad is marked as sponsored |
| `ad_text` | String | Ad copy/text content |
| `creative_url` | String | Image or video URL |
| `ad_type` | String | `image`, `video`, or `unknown` |
| `cta_url` | String | Call-to-action destination URL |
| `cta_text` | String | CTA button text |
| `cta_domain` | String | Extracted domain from CTA URL |
| `status` | String | `SUCCESS`, `ERROR`, or `FAILED` |

## Makefile Commands

Convenient shortcuts for common tasks:

```bash
make help            # Show all available commands
make install         # Install npm dependencies
make run             # Run locally without Docker
make run_locally     # Run in Docker with temporary input
make build           # Build Docker image
make create_input    # Create sample INPUT.json
make view_results    # View crawled data summary
make clean           # Clean storage/datasets
make lint            # Run ESLint
make format          # Format code with Prettier
make push            # Push to Apify platform
make deploy          # Build and deploy to Apify
```

## Project Structure

```
.
├── .actor/
│   ├── actor.json           # Actor metadata and configuration
│   └── input_schema.json    # Input validation schema
├── src/
│   ├── main.js              # Main crawler orchestration
│   └── routes.js            # Ad parsing and extraction logic
├── storage/
│   ├── datasets/            # Output data (crawled ads)
│   ├── key_value_stores/    # Input configuration
│   └── request_queues/      # Crawl queue management
├── Dockerfile               # Container image definition
├── Makefile                 # Development convenience commands
├── CLAUDE.md                # Detailed technical documentation
├── package.json             # Node.js dependencies
└── README.md                # This file
```

## How It Works

### 1. Input Validation
- Validates URL format for Facebook Ads Archive
- Ensures required parameters are present
- Sets defaults for optional configuration

### 2. Crawler Initialization
- Creates CheerioCrawler instance with Cheerio (fast HTML parsing)
- Configures proxy rotation for IP anonymization
- Sets up concurrency controls and timeouts

### 3. Data Extraction
For each ad URL, the crawler:
- Fetches HTML with proxy rotation
- Parses page using Cheerio
- Extracts data using multiple patterns (JSON embedded in HTML + DOM selectors)
- Applies fallback patterns if primary extraction fails
- Saves structured data to Dataset

### 4. Error Handling
- Automatic retries (up to 3x) with exponential backoff
- Graceful degradation on parsing failures
- Failed requests saved with error details for debugging

## Extraction Strategy

### Creative URLs (Images/Videos)

**Priority order:**
1. JSON pattern: `"resized_image_url":"..."` (highest quality)
2. JSON pattern: `"video_hd_url":"..."` for video ads
3. DOM fallback: `<img src="...fbcdn...">` (excluding small thumbnails)
4. DOM fallback: `<video poster="...">` for video thumbnails

### CTA URLs

**Priority order:**
1. JSON pattern: `"link_url":"..."` in body HTML
2. Facebook redirect: Parse `l.facebook.com/l.php?u=TARGET_URL`
3. Direct external links: Find `<a href="http...">` (non-Facebook)

### Text & Metadata

- **Ad Text**: Extracted from specific CSS classes, filtered by length
- **Advertiser**: From link text or image alt attributes
- **Library ID**: Parsed from "Library ID: XXXXX" text
- **Sponsored**: Boolean based on presence of "Sponsored" label

## Performance

**Benchmark results** (3 ads tested):
- **Total time**: 0.62 seconds
- **Average per ad**: 0.21 seconds
- **Throughput**: 292 requests/minute
- **Success rate**: 100% (3/3 succeeded)

**Concurrency recommendations:**
- **Local dev**: 3-5 concurrent requests
- **Production**: 5-10 with Apify Proxy
- **High volume**: 10-20 (monitor rate limits)

## Deployment

### Deploy to Apify Platform

```bash
# Login to Apify
apify login

# Push Actor to platform
apify push

# Or use Makefile
make deploy
```

### Production Configuration

Recommended settings for Apify platform:
- **Memory**: 2048 MB
- **Timeout**: 900 seconds (15 minutes)
- **Proxy**: Apify Proxy (automatic rotation)
- **Max concurrency**: 10

## Debugging

### Enable Debug Logs

```bash
export CRAWLEE_LOG_LEVEL=DEBUG
npm start
```

### View Results

```bash
# JSON format (with jq)
cat storage/datasets/default/*.json | jq '.'

# Summary view
make view_results

# Count successful extractions
cat storage/datasets/default/*.json | jq -r 'select(.status == "SUCCESS") | .ad_id' | wc -l
```

### Common Issues

**"Could not extract creative URL"**
- Ad page structure may have changed
- Check raw HTML for new patterns
- Update extraction patterns in `src/routes.js`

**Rate limiting / 429 errors**
- Reduce `maxConcurrency`
- Enable Apify Proxy for production
- Add delays between requests if needed

**"Invalid password provided: User not found"**
- Normal warning for local development without Apify token
- Proxy will be disabled automatically
- Set `APIFY_TOKEN` environment variable for proxy access

## Best Practices

### Input Preparation
- Validate URLs before crawling
- Remove duplicates from `startUrls`
- Use consistent access tokens

### Rate Limiting
- Start with low concurrency (3-5)
- Monitor for 429 (Too Many Requests) errors
- Enable proxy rotation for production

### Data Quality
- Check `status` field for success/failure
- Filter out records where `creative_url` is null
- Verify `cta_url` extraction for critical use cases

### Batch Processing
For large URL lists:
- Split into batches of 500-1000 URLs
- Run multiple Actor instances in parallel
- Use Apify Webhooks for completion notifications

## API Usage

### Run via Apify API

```bash
curl -X POST https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startUrls": [
      "https://www.facebook.com/ads/archive/render_ad/?id=123&access_token=TOKEN"
    ],
    "maxConcurrency": 5
  }'
```

### Get Results

```bash
curl https://api.apify.com/v2/datasets/YOUR_DATASET_ID/items \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## Technical Stack

- **[Apify SDK](https://docs.apify.com/sdk/js)** v3.4.2 - Actor runtime and storage
- **[Crawlee](https://crawlee.dev/)** v3.13.8 - Web scraping framework
- **[Cheerio](https://cheerio.js.org/)** - Fast HTML parsing (included in Crawlee)
- **Node.js** ≥18.0.0 - JavaScript runtime

## Contributing

Contributions welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style (ESLint + Prettier)
- Add comments for complex extraction logic
- Test with multiple ad types (image, video, carousel)
- Update CLAUDE.md for technical changes

## Resources

### Documentation
- [Apify Platform Documentation](https://docs.apify.com/platform)
- [Crawlee Documentation](https://crawlee.dev/)
- [Cheerio Documentation](https://cheerio.js.org/)
- [Facebook Ads Library](https://www.facebook.com/ads/library/)

### Tutorials
- [Crawlee Quick Start](https://crawlee.dev/docs/quick-start)
- [Web Scraping with Cheerio](https://blog.apify.com/web-scraping-with-cheerio/)
- [Building Apify Actors](https://docs.apify.com/platform/actors/development)

### Community
- [Apify Discord](https://discord.com/invite/jyEM2PRvMU)
- [Crawlee Discord](https://discord.com/invite/jyEM2PRvMU)

## License

ISC License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/facebook-ads-archive-crawler/issues)
- **Documentation**: See [CLAUDE.md](./CLAUDE.md) for detailed technical documentation
- **Discord**: [Apify Community](https://discord.com/invite/jyEM2PRvMU)

---

**Maintained by**: Your Name
**Last Updated**: 2025-10-28
**Version**: 1.0.0
