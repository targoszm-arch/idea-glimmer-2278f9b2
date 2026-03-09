# Article Cover Images Migration Guide

## Overview
Your article cover images are now stored in Supabase Storage instead of as base64 data URLs. This provides better performance, smaller database sizes, and proper CDN delivery.

## What Changed

### 1. Storage Bucket Created
- **Bucket name:** `article-covers`
- **Access:** Public (anyone can view images)
- **Security:** Only authenticated users can upload/modify images

### 2. Updated Edge Function
The `generate-cover-image` edge function now:
- Generates images with DALL-E (as before)
- Uploads them to Supabase Storage
- Returns the public URL instead of base64

### 3. Existing Articles
Articles with base64 cover images will continue to work. New articles will automatically use Storage URLs.

## Storage Structure

```
article-covers/
└── covers/
    ├── cover-1234567890-abc123.png
    ├── cover-1234567891-def456.png
    └── ...
```

## Migration Script (Optional)

If you want to migrate existing base64 images to Storage, you can run this one-time script:

```sql
-- This would require a custom migration script to:
-- 1. Query all articles with base64 cover_image_url
-- 2. Upload each to Storage
-- 3. Update the article record with the new URL
```

Since you only have 1 article with a base64 image, it's fine to leave it as-is or regenerate the cover image (which will automatically use Storage).

## Testing

Generate a new article cover image and verify it's stored in the `article-covers` bucket in your Supabase dashboard.
