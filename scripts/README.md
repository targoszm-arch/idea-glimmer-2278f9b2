# Framer Publishing Scripts

This directory contains scripts for publishing articles to Framer CMS using the Framer Server API.

## Setup

1. **Install dependencies:**
   ```bash
   cd scripts
   npm install
   ```

2. **Configure environment variables:**
   - Copy `.env.local.example` to `.env.local`
   - Update with your Framer and Supabase credentials

3. **Get your Framer API key:**
   - Open your Framer project
   - Press `Cmd+K` and type "open settings"
   - Navigate to the "API Keys" section
   - Create a new API key and copy it

4. **Get your Framer Project URL:**
   - Open your Framer project
   - Copy the URL from the browser (e.g., `https://framer.com/projects/Website--abc123`)

## Usage

### Publish all published articles:
```bash
npm run publish:framer
```

### Publish a specific article:
```bash
node publish-to-framer.js --article-id=<article-id>
```

### Re-publish ALL articles (including drafts):
```bash
npm run publish:framer:all
```

## Framer Collection Setup

Before running the script, you need to set up a "Blog" collection in Framer with the following fields:

1. **Title** (String)
2. **Slug** (String)
3. **Content** (Formatted Text)
4. **Excerpt** (String)
5. **Category** (String)
6. **Cover Image** (Image)
7. **Meta Description** (String)

The script will automatically map your article data to these fields.

## Automation

You can automate publishing by:

1. **Using cron jobs** - Schedule the script to run periodically
2. **Webhooks** - Trigger publishing when articles are updated
3. **CI/CD pipeline** - Integrate into your deployment workflow

### Example cron job (runs every hour):
```bash
0 * * * * cd /path/to/scripts && node publish-to-framer.js >> framer-publish.log 2>&1
```

## Auto-Publish Settings

Set these in `.env.local` to enable automatic publishing:

- `FRAMER_AUTO_PUBLISH=true` - Automatically create a preview deployment
- `FRAMER_AUTO_DEPLOY=true` - Automatically promote to production (be careful!)

## Troubleshooting

### "Blog collection not found"
Create a collection named "Blog" in your Framer project first.

### "Missing Framer credentials"
Make sure `.env.local` exists and contains valid credentials.

### Field mapping issues
Check that your Framer collection has fields matching the names expected by the script (case-insensitive).

## Learn More

- [Framer Server API Documentation](https://www.framer.com/developers/server-api-quick-start)
- [framer-api npm package](https://www.npmjs.com/package/framer-api)
