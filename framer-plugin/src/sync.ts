import { framer, type ManagedCollection, type ManagedCollectionItemInput } from "framer-plugin"
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY } from "./config"
import { PLUGIN_DATA_KEY } from "./constants"

export const PLUGIN_KEYS = {
    CONFIGURED: "configured",
} as const

// Field definitions
export const FIELDS = [
    { id: "title",        name: "Title",            type: "string"        },
    { id: "body",         name: "Body",             type: "formattedText" },
    { id: "excerpt",      name: "Excerpt",          type: "string"        },
    { id: "category",     name: "Category",         type: "string"        },
    { id: "metaDesc",     name: "Meta Description", type: "string"        },
    { id: "pubDate",      name: "Published Date",   type: "date"          },
    { id: "coverImage",   name: "Cover Image",      type: "image"         },
] as const satisfies { id: string; name: string; type: string }[]

type Article = {
    id: string; title: string; slug: string; content: string
    excerpt: string; meta_description: string; category: string
    cover_image_url: string | null; created_at: string
}

async function getStoredApiKey(): Promise<string | null> {
    try {
        const key = await framer.getPluginData(PLUGIN_DATA_KEY)
        if (key && key.trim().startsWith("cl_")) return key.trim()
        return null
    } catch {
        return null
    }
}

async function fetchArticles(category: string, apiKey: string): Promise<Article[]> {
    const param = category !== "all" ? `&category=${encodeURIComponent(category)}` : ""
    const res = await fetch(`${SYNC_ENDPOINT}?status=published${param}`, {
        headers: { Authorization: `Bearer ${apiKey}`, apikey: SUPABASE_ANON_KEY },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    const { articles } = await res.json()
    return articles ?? []
}

async function uploadImageSafe(url: string): Promise<string | null> {
    if (!url) return null
    return url
}

export async function performSync(collection: ManagedCollection, category = "all"): Promise<number> {
    const apiKey = await getStoredApiKey()
    if (!apiKey) {
        throw new Error("No ContentLab API key found. Open the plugin and enter your API key first.")
    }

    const articles = await fetchArticles(category, apiKey)
    if (!articles.length) return 0

    const existingIds = new Set(await collection.getItemIds())

    const items: ManagedCollectionItemInput[] = []
    for (const a of articles) {
        existingIds.delete(a.id)

        const imageAsset = a.cover_image_url ? await uploadImageSafe(a.cover_image_url) : null

        const fieldData: Record<string, any> = {
            title:      { type: "string",        value: a.title ?? "" },
            body:       { type: "formattedText", value: a.content ?? "" },
            excerpt:    { type: "string",        value: a.excerpt ?? "" },
            category:   { type: "string",        value: a.category ?? "" },
            metaDesc:   { type: "string",        value: a.meta_description ?? "" },
            pubDate:    { type: "date",          value: a.created_at ?? "" },
        }
        fieldData.coverImage = imageAsset

        items.push({ id: a.id, slug: a.slug, draft: false, fieldData })
    }

    if (existingIds.size > 0) await collection.removeItems(Array.from(existingIds))
    await collection.addItems(items)

    return items.length
}

// Called from main.tsx at top level — handles background sync mode
export async function syncExistingCollection(collection: ManagedCollection): Promise<{ didSync: boolean }> {
    if (framer.mode !== "syncManagedCollection") return { didSync: false }

    if (!framer.isAllowedTo("ManagedCollection.removeItems", "ManagedCollection.addItems")) {
        return { didSync: false }
    }

    // Check if API key exists before attempting sync
    const apiKey = await getStoredApiKey()
    if (!apiKey) {
        // No key saved — show UI so user can enter it
        return { didSync: false }
    }

    try {
        await performSync(collection)
        return { didSync: true }
    } catch (error) {
        console.error("Sync failed:", error)
        framer.notify("Sync failed — check browser console", { variant: "error" })
        return { didSync: false }
    }
}
