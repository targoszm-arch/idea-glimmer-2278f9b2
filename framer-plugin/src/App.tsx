import { framer } from "framer-plugin"
import { useState, useEffect } from "react"
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY } from "./config"

// ── Types ──────────────────────────────────────────────────────────────────
type Article = {
  id: string; title: string; slug: string; content: string
  excerpt: string; meta_description: string; category: string
  cover_image_url: string | null; created_at: string; updated_at: string
}

type Collection = { id: string; name: string }
type Status = "idle" | "loading" | "syncing" | "success" | "error"

const FIELDS = [
  { name: "Title", type: "string" as const },
  { name: "Body", type: "formattedText" as const },
  { name: "Excerpt", type: "string" as const },
  { name: "Category", type: "string" as const },
  { name: "Cover Image", type: "image" as const },
  { name: "Meta Description", type: "string" as const },
  { name: "Published Date", type: "date" as const },
] as const

// ── Managed Collection hooks (called by Framer automatically) ──────────────
export async function configureManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) return
  for (const field of FIELDS) {
    try { await collection.addField({ name: field.name, type: field.type }) } catch { }
  }
  framer.showToast("Collection configured ✓")
}

export async function syncManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) { framer.showToast("No managed collection found"); return }
  await doSync(collection, "all")
}

// ── Core sync logic (shared by auto-mode and UI) ───────────────────────────
async function doSync(collection: any, category: string): Promise<{ count: number }> {
  const categoryParam = category !== "all" ? `&category=${encodeURIComponent(category)}` : ""
  const res = await fetch(`${SYNC_ENDPOINT}?status=published${categoryParam}`, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
  })
  if (!res.ok) throw new Error(await res.text())

  const { articles } = (await res.json()) as { articles: Article[] }
  if (!articles?.length) return { count: 0 }

  const fields = await collection.getFields()
  const fieldMap = new Map(fields.map((f: any) => [f.name, f.id]))

  const items = articles.map((article) => {
    const fieldData: Record<string, any> = {}
    const set = (name: string, value: any) => { const id = fieldMap.get(name); if (id) fieldData[id] = value }
    set("Title", { type: "string", value: article.title })
    set("Body", { type: "formattedText", value: article.content, contentType: "html" })
    set("Excerpt", { type: "string", value: article.excerpt })
    set("Category", { type: "string", value: article.category })
    set("Meta Description", { type: "string", value: article.meta_description })
    set("Published Date", { type: "date", value: article.created_at })
    if (article.cover_image_url && !article.cover_image_url.startsWith("data:")) {
      set("Cover Image", { type: "image", value: article.cover_image_url })
    }
    return { id: article.id, slug: article.slug, title: article.title, fieldData }
  })

  await collection.addItems(items)
  return { count: articles.length }
}

// ── Route Framer's automatic mode calls ───────────────────────────────────
const mode = new URLSearchParams(window.location.search).get("mode")
if (mode === "configureManagedCollection") configureManagedCollection()
else if (mode === "syncManagedCollection") syncManagedCollection()

// ── Plugin UI ──────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")

  // Data from Supabase
  const [categories, setCategories] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)

  // Framer collections
  const [collections, setCollections] = useState<Collection[]>([])

  // User selections
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("")
  const [selectedCategory, setSelectedCategory] = useState<string>("all")

  // Last sync log
  const [syncLog, setSyncLog] = useState<{ collectionName: string; category: string; count: number; time: string }[]>([])

  // Load Framer collections + ContentLab categories on mount
  useEffect(() => {
    setStatus("loading")

    // Fetch categories from Supabase
    fetch(`${SYNC_ENDPOINT}?status=published`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories ?? [])
        setTotalCount(d.count ?? null)
      })
      .catch(() => {})

    // Fetch Framer collections via plugin API
    framer.getCollections?.()
      .then((cols: any[]) => {
        const mapped = cols.map((c: any) => ({ id: c.id, name: c.name }))
        setCollections(mapped)
        if (mapped.length > 0) setSelectedCollectionId(mapped[0].id)
      })
      .catch(() => {
        // getCollections may not be available in all modes; fall back to getManagedCollection
        framer.getManagedCollection().then((col: any) => {
          if (col) {
            setCollections([{ id: col.id ?? "managed", name: col.name ?? "Managed Collection" }])
            setSelectedCollectionId(col.id ?? "managed")
          }
        }).catch(() => {})
      })
      .finally(() => setStatus("idle"))
  }, [])

  async function handleSync() {
    if (!selectedCollectionId) {
      setStatus("error"); setMessage("Please select a collection first."); return
    }

    setStatus("syncing"); setMessage("")
    try {
      // Find the collection object
      let collection: any = null
      try {
        const cols = await framer.getCollections?.()
        collection = cols?.find((c: any) => c.id === selectedCollectionId)
      } catch { }

      if (!collection) {
        // Fall back to managed collection
        collection = await framer.getManagedCollection()
      }
      if (!collection) throw new Error("Could not access the selected collection. Make sure this plugin is added to your CMS collection.")

      const { count } = await doSync(collection, selectedCategory)
      const colName = collections.find(c => c.id === selectedCollectionId)?.name ?? "Collection"
      const catLabel = selectedCategory === "all" ? "All categories" : selectedCategory
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

      setSyncLog(prev => [{ collectionName: colName, category: catLabel, count, time }, ...prev.slice(0, 4)])
      setStatus("success")
      setMessage(count === 0 ? "No articles found for that category." : `${count} article${count !== 1 ? "s" : ""} synced into "${colName}".`)
      framer.showToast(count > 0 ? `Synced ${count} article(s) into "${colName}" ✓` : "No articles found.")
    } catch (err: any) {
      setStatus("error")
      setMessage(err?.message ?? "Sync failed. Check your connection and try again.")
      framer.showToast("Sync failed")
    }
  }

  const isBusy = status === "loading" || status === "syncing"

  return (
    <main style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoWrap}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="5" fill="#0066FF"/>
            <path d="M5 5h10v3.5H8.5V10H14v3H8.5v2H5V5z" fill="white"/>
          </svg>
        </div>
        <div>
          <div style={s.title}>Skill Studio</div>
          <div style={s.subtitle}>ContentLab → Framer CMS</div>
        </div>
        {totalCount !== null && <div style={s.badge}>{totalCount} articles</div>}
      </div>

      <div style={s.divider} />

      {/* Collection picker */}
      <label style={s.label}>Framer Collection</label>
      {collections.length === 0 ? (
        <div style={s.emptyHint}>
          {status === "loading" ? "Loading collections…" : "No collections found. Add this plugin to a CMS collection first."}
        </div>
      ) : (
        <select
          style={s.select}
          value={selectedCollectionId}
          onChange={(e) => setSelectedCollectionId(e.target.value)}
          disabled={isBusy}
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      {/* Category picker */}
      <label style={s.label}>Article Category</label>
      <select
        style={s.select}
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        disabled={isBusy || categories.length === 0}
      >
        <option value="all">All categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

      {/* Sync button */}
      <button
        style={{ ...s.button, ...(isBusy ? s.buttonDisabled : {}) }}
        onClick={handleSync}
        disabled={isBusy || collections.length === 0}
      >
        {status === "syncing" ? (
          <><span style={s.spinner} />Syncing…</>
        ) : (
          <><SyncIcon />Sync to Framer</>
        )}
      </button>

      {/* Status message */}
      {message && (
        <div style={{ ...s.msg, ...(status === "error" ? s.msgError : s.msgSuccess) }}>
          {status === "error" ? "⚠ " : "✓ "}{message}
        </div>
      )}

      {/* Sync log */}
      {syncLog.length > 0 && (
        <>
          <div style={s.divider} />
          <div style={s.logTitle}>Recent Syncs</div>
          {syncLog.map((entry, i) => (
            <div key={i} style={s.logRow}>
              <div style={s.logLeft}>
                <div style={s.logCollection}>{entry.collectionName}</div>
                <div style={s.logMeta}>{entry.category} · {entry.count} article{entry.count !== 1 ? "s" : ""}</div>
              </div>
              <div style={s.logTime}>{entry.time}</div>
            </div>
          ))}
        </>
      )}

      {/* Footer */}
      <div style={s.divider} />
      <p style={s.hint}>
        Each collection can be synced independently with a different category filter. Run the sync as many times as needed.
      </p>
    </main>
  )
}

function SyncIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ marginRight: 6 }}>
      <path d="M7 1.5A5.5 5.5 0 1 1 1.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M1.5 4V7H4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: { fontFamily: "system-ui, -apple-system, sans-serif", padding: 16, display: "flex", flexDirection: "column", gap: 10, background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", minHeight: "100vh", boxSizing: "border-box" },
  header: { display: "flex", alignItems: "center", gap: 10 },
  logoWrap: { width: 34, height: 34, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  title: { fontWeight: 700, fontSize: 13, lineHeight: 1.2 },
  subtitle: { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", lineHeight: 1.3 },
  badge: { marginLeft: "auto", background: "var(--framer-color-bg-secondary,#f0f0f0)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, color: "var(--framer-color-text-secondary,#555)", whiteSpace: "nowrap" },
  divider: { height: 1, background: "var(--framer-color-divider,#eee)", margin: "2px 0" },
  label: { fontSize: 11, fontWeight: 600, color: "var(--framer-color-text-secondary,#666)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: -4 },
  select: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--framer-color-divider,#ddd)", background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", fontSize: 13, cursor: "pointer", outline: "none", appearance: "auto" },
  emptyHint: { fontSize: 12, color: "var(--framer-color-text-tertiary,#999)", padding: "8px 0" },
  button: { display: "flex", alignItems: "center", justifyContent: "center", background: "#0066FF", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 2 },
  buttonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  spinner: { width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", marginRight: 8, display: "inline-block" },
  msg: { fontSize: 12, borderRadius: 6, padding: "8px 10px", lineHeight: 1.5 },
  msgSuccess: { background: "#e6f4ea", color: "#1a6b35" },
  msgError: { background: "#fdecea", color: "#8b1a1a" },
  logTitle: { fontSize: 11, fontWeight: 600, color: "var(--framer-color-text-secondary,#666)", textTransform: "uppercase", letterSpacing: "0.05em" },
  logRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--framer-color-divider,#f0f0f0)" },
  logLeft: { display: "flex", flexDirection: "column", gap: 2 },
  logCollection: { fontSize: 12, fontWeight: 600 },
  logMeta: { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)" },
  logTime: { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", whiteSpace: "nowrap" },
  hint: { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", lineHeight: 1.5, margin: 0 },
}

if (typeof document !== "undefined") {
  const st = document.createElement("style")
  st.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
  document.head.appendChild(st)
}
