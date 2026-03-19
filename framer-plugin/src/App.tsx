import { framer } from "framer-plugin"
import { useState, useEffect } from "react"
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY } from "./config"

type Article = {
  id: string; title: string; slug: string; content: string
  excerpt: string; meta_description: string; category: string
  cover_image_url: string | null; created_at: string
}

const F = {
  title:    "fldaaa",
  body:     "fldbbb",
  excerpt:  "fldccc",
  category: "fldddd",
  metaDesc: "fldeee",
  pubDate:  "fldfff",
  image:    "fldggg",
}

const FIELDS = [
  { id: F.title,    name: "Title",            type: "string" as const },
  { id: F.body,     name: "Body",             type: "formattedText" as const },
  { id: F.excerpt,  name: "Excerpt",          type: "string" as const },
  { id: F.category, name: "Category",         type: "string" as const },
  { id: F.metaDesc, name: "Meta Description", type: "string" as const },
  { id: F.pubDate,  name: "Published Date",   type: "date" as const },
  { id: F.image,    name: "Cover Image",      type: "image" as const },
]

export async function configureManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) return
  await collection.setFields(FIELDS)
  framer.notify("Skill Studio: Collection ready ✓")
}

export async function syncManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) return
  try {
    const count = await syncArticles(collection, "all")
    framer.notify(count > 0 ? `Synced ${count} article(s) ✓` : "No articles to sync.")
  } catch (e: any) {
    framer.notify(`Sync failed: ${e?.message ?? "error"}`)
  }
}

export async function syncArticles(collection: any, category: string): Promise<number> {
  const param = category !== "all" ? `&category=${encodeURIComponent(category)}` : ""
  const res = await fetch(`${SYNC_ENDPOINT}?status=published${param}`, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const { articles } = await res.json() as { articles: Article[] }
  if (!articles?.length) return 0

  const items = articles.map((a) => {
    const fieldData: Record<string, any> = {
      [F.title]:    { type: "string",        value: a.title ?? "" },
      [F.body]:     { type: "formattedText", value: a.content ?? "" },
      [F.excerpt]:  { type: "string",        value: a.excerpt ?? "" },
      [F.category]: { type: "string",        value: a.category ?? "" },
      [F.metaDesc]: { type: "string",        value: a.meta_description ?? "" },
      [F.pubDate]:  { type: "date",          value: a.created_at ?? "" },
    }
    // Supabase Storage URL is absolute public HTTPS — Framer downloads & hosts it
    if (a.cover_image_url) {
      fieldData[F.image] = { type: "image", value: { src: a.cover_image_url } }
    }
    return { id: a.id, slug: a.slug, fieldData }
  })

  await collection.addItems(items)
  return items.length
}

// ── UI ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState<"idle"|"syncing"|"success"|"error">("idle")
  const [message, setMessage] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${SYNC_ENDPOINT}?status=published`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    })
      .then(r => r.json())
      .then(d => { setCategories(d.categories ?? []); setTotalCount(d.count ?? null) })
      .catch(() => {})
  }, [])

  async function handleSync() {
    setStatus("syncing"); setMessage("")
    try {
      const collection = await framer.getManagedCollection()
      if (!collection) throw new Error("No collection — add plugin via CMS → Add Plugin first.")
      const count = await syncArticles(collection, selectedCategory)
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setStatus("success")
      setMessage(count === 0 ? "No articles found." : `${count} article${count !== 1 ? "s" : ""} synced.`)
    } catch (err: any) {
      setStatus("error")
      setMessage(err?.message ?? "Sync failed.")
    }
  }

  const syncing = status === "syncing"

  return (
    <main style={s.root}>
      <div style={s.header}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
          <rect width="20" height="20" rx="5" fill="#0066FF"/>
          <path d="M5 5h10v3.5H8.5V10H14v3H8.5v2H5V5z" fill="white"/>
        </svg>
        <div style={{ flex: 1 }}>
          <div style={s.title}>Skill Studio</div>
          <div style={s.sub}>ContentLab → Framer CMS</div>
        </div>
        {totalCount !== null && <div style={s.badge}>{totalCount} articles</div>}
      </div>

      <div style={s.divider}/>

      <label style={s.label}>Category</label>
      <select style={s.select} value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} disabled={syncing}>
        <option value="all">All categories</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <button style={{ ...s.btn, ...(syncing ? s.btnOff : {}) }} onClick={handleSync} disabled={syncing}>
        {syncing ? "Syncing…" : "Sync from ContentLab"}
      </button>

      {message && (
        <div style={{ ...s.msg, ...(status === "error" ? s.msgErr : s.msgOk) }}>
          {status === "error" ? "⚠ " : "✓ "}{message}
        </div>
      )}
      {lastSync && <div style={s.meta}>Last synced at {lastSync}</div>}

      <div style={s.divider}/>
      <p style={s.hint}>First time? Add via <strong>CMS → Add Plugin</strong>, then sync.</p>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:    { fontFamily: "system-ui,sans-serif", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", minHeight: "100vh", boxSizing: "border-box" },
  header:  { display: "flex", alignItems: "center", gap: 10 },
  title:   { fontWeight: 700, fontSize: 13 },
  sub:     { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)" },
  badge:   { marginLeft: "auto", background: "var(--framer-color-bg-secondary,#f0f0f0)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
  divider: { height: 1, background: "var(--framer-color-divider,#eee)" },
  label:   { fontSize: 11, fontWeight: 600, color: "var(--framer-color-text-secondary,#666)", textTransform: "uppercase", letterSpacing: "0.05em" },
  select:  { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--framer-color-divider,#ddd)", background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", fontSize: 13 },
  btn:     { background: "#0066FF", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" },
  btnOff:  { opacity: 0.5, cursor: "not-allowed" },
  msg:     { fontSize: 12, borderRadius: 6, padding: "8px 10px" },
  msgOk:   { background: "#e6f4ea", color: "#1a6b35" },
  msgErr:  { background: "#fdecea", color: "#8b1a1a" },
  meta:    { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", textAlign: "center" },
  hint:    { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", lineHeight: 1.5, margin: 0 },
}
