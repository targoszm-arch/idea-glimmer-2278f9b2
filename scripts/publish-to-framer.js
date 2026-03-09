#!/usr/bin/env node

/**
 * Framer CMS Publishing Script
 * 
 * This script uses the Framer Server API to publish articles from your Supabase database
 * to a Framer CMS collection.
 * 
 * Prerequisites:
 * 1. Install dependencies: npm install framer-api @supabase/supabase-js dotenv
 * 2. Set environment variables in .env.local:
 *    - FRAMER_PROJECT_URL (e.g., "https://framer.com/projects/Website--abc123")
 *    - FRAMER_API_KEY (from Framer project settings)
 *    - SUPABASE_URL
 *    - SUPABASE_SERVICE_ROLE_KEY
 * 
 * Usage:
 *   node scripts/publish-to-framer.js                    # Publish all unpublished articles
 *   node scripts/publish-to-framer.js --article-id=<id>  # Publish specific article
 *   node scripts/publish-to-framer.js --all              # Re-publish all articles
 */

import { connect } from "framer-api";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: ".env.local" });

const FRAMER_PROJECT_URL = process.env.FRAMER_PROJECT_URL;
const FRAMER_API_KEY = process.env.FRAMER_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!FRAMER_PROJECT_URL || !FRAMER_API_KEY) {
  console.error("❌ Missing Framer credentials. Set FRAMER_PROJECT_URL and FRAMER_API_KEY in .env.local");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("🚀 Connecting to Framer...");
  
  // Connect to Framer project
  const framer = await connect(FRAMER_PROJECT_URL, FRAMER_API_KEY);

  try {
    // Get all collections
    const collections = await framer.getCollections();
    console.log(`📚 Found ${collections.length} collection(s) in Framer project`);

    // Find or create the "Blog" collection
    let blogCollection = collections.find(c => c.name === "Blog");
    
    if (!blogCollection) {
      console.log("📝 Creating 'Blog' collection...");
      // Note: You may need to create this manually in Framer first
      // or use createManagedCollection if you want plugin-managed collections
      console.error("❌ Blog collection not found. Please create it in Framer first.");
      process.exit(1);
    }

    console.log(`✅ Using collection: ${blogCollection.name}`);

    // Get collection fields to map our data
    const fields = await blogCollection.getFields();
    console.log(`📋 Collection has ${fields.length} field(s)`);

    // Map field names to IDs
    const fieldMap = {};
    fields.forEach(field => {
      fieldMap[field.name.toLowerCase()] = field.id;
    });

    console.log("Field mapping:", fieldMap);

    // Parse command line arguments
    const args = process.argv.slice(2);
    const articleIdArg = args.find(arg => arg.startsWith("--article-id="));
    const publishAll = args.includes("--all");

    let query = supabase.from("articles").select("*");

    if (articleIdArg) {
      const articleId = articleIdArg.split("=")[1];
      query = query.eq("id", articleId);
      console.log(`📄 Publishing specific article: ${articleId}`);
    } else if (!publishAll) {
      query = query.eq("status", "published");
      console.log("📄 Publishing all published articles...");
    } else {
      console.log("📄 Publishing ALL articles...");
    }

    const { data: articles, error } = await query;

    if (error) {
      console.error("❌ Error fetching articles:", error);
      process.exit(1);
    }

    if (!articles || articles.length === 0) {
      console.log("ℹ️  No articles to publish");
      await framer.disconnect();
      return;
    }

    console.log(`\n📦 Publishing ${articles.length} article(s)...`);

    // Prepare items for Framer
    const items = articles.map(article => {
      const fieldData = {};

      // Map each article field to Framer CMS fields
      if (fieldMap.title) {
        fieldData[fieldMap.title] = { type: "string", value: article.title };
      }
      if (fieldMap.slug) {
        fieldData[fieldMap.slug] = { type: "string", value: article.slug };
      }
      if (fieldMap.content) {
        fieldData[fieldMap.content] = { 
          type: "formattedText", 
          value: article.content,
          contentType: "html"
        };
      }
      if (fieldMap.excerpt) {
        fieldData[fieldMap.excerpt] = { type: "string", value: article.excerpt };
      }
      if (fieldMap.category) {
        fieldData[fieldMap.category] = { type: "string", value: article.category };
      }
      if (fieldMap["cover image"] && article.cover_image_url) {
        fieldData[fieldMap["cover image"]] = { 
          type: "image", 
          value: article.cover_image_url 
        };
      }
      if (fieldMap["meta description"]) {
        fieldData[fieldMap["meta description"]] = { 
          type: "string", 
          value: article.meta_description 
        };
      }

      return {
        id: article.id,
        slug: article.slug,
        fieldData,
      };
    });

    // Add items to collection
    await blogCollection.addItems(items);

    console.log(`✅ Successfully published ${articles.length} article(s) to Framer!`);

    // Optional: Publish to production
    const shouldPublish = process.env.FRAMER_AUTO_PUBLISH === "true";
    if (shouldPublish) {
      console.log("\n🚀 Publishing changes to preview...");
      const { deployment } = await framer.publish();
      console.log(`✅ Preview deployed: ${deployment.id}`);
      
      // Optionally promote to production
      const shouldDeploy = process.env.FRAMER_AUTO_DEPLOY === "true";
      if (shouldDeploy) {
        console.log("🌐 Deploying to production...");
        await framer.deploy(deployment.id);
        console.log("✅ Deployed to production!");
      }
    }

  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await framer.disconnect();
    console.log("\n👋 Disconnected from Framer");
  }
}

main();
