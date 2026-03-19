import { framer, type ManagedCollection, type ManagedCollectionItemInput } from "framer-plugin"
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY } from "./config"

export const PLUGIN_KEYS = {
    CONFIGURED: "configured",
} as const

// Field definitions — ids are short readable strings (official pattern uses field name as id)
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

async function fetchArticles(category: string): Promise<Article[]> {
    const param = category !== "all" ? `&category=${encodeURIComponent(category)}` : ""
    const res = await fetch(`${SYNC_ENDPOINT}?status=published${param}`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { articles } = await res.json()
    return articles ?? []
}

async function uploadImageSafe(url: string) {
    try {
        if (!url) return null
        return await framer.uploadImage({ image: url, name: url.split("/").pop() ?? "image" })
    } catch {
        return null
    }
}

export async function performSync(collection: ManagedCollection, category = "all"): Promise<number> {
    const articles = await fetchArticles(category)
    if (!articles.length) return 0

    const existingIds = new Set(await collection.getItemIds())

    const items: ManagedCollectionItemInput[] = []
    for (const a of articles) {
        existingIds.delete(a.id) // track what's still in source

        const imageAsset = a.cover_image_url ? await uploadImageSafe(a.cover_image_url) : null

        const fieldData: Record<string, any> = {
            title:      { type: "string",        value: a.title ?? "" },
            body:       { type: "formattedText", value: a.content ?? "" },
            excerpt:    { type: "string",        value: a.excerpt ?? "" },
            category:   { type: "string",        value: a.category ?? "" },
            metaDesc:   { type: "string",        value: a.meta_description ?? "" },
            pubDate:    { type: "date",          value: a.created_at ?? "" },
        }
        if (imageAsset) {
            fieldData.coverImage = { type: "image", value: imageAsset }
        }

        items.push({ id: a.id, slug: a.slug, draft: false, fieldData })
    }

    // Remove items no longer in source
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

    try {
        await performSync(collection)
        return { didSync: true }
    } catch (error) {
        console.error("Sync failed:", error)
        framer.notify("Sync failed — check browser console", { variant: "error" })
        return { didSync: false }
    }
}
