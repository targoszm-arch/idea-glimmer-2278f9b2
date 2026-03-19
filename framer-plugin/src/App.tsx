import { framer } from "framer-plugin"
import { useState, useEffect } from "react"
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY } from "./config"

// ── Types ──────────────────────────────────────────────────────────────────
type Article = {
  id: string; title: string; slug: string; content: string
  excerpt: string; meta_description: string; category: string
  cover_image_url: string | null; created_at: string; updated_at: string
}
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

// ── Managed Collection modes (called by Framer automatically) ──────────────
export async function configureManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) return
  for (const field of FIELDS) {
    try { await collection.addField({ name: field.name, type: field.type }) } catch { }
  }
  framer.notify("Collection configured ✓")
}

export async function syncManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) { framer.notify("No managed collection found"); return }
  await doSync(collection, "all")
}

// ── Core sync logic ────────────────────────────────────────────────────────
async function doSync(collection: any, category: string): Promise<{ count: number }> {
  const categoryParam = category !== "all" ? `&category=${encodeURIComponent(category)}` : ""
  const res = await fetch(`${SYNC_ENDPOINT}?status=published${categoryParam}`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
  })
  if (!res.ok) throw new Error(await res.text())

  const { articles } = (await res.json()) as { articles: Article[] }
  if (!articles?.length) return { count: 0 }

  const fields = await collection.getFields()
  const fieldMap = new Map(fields.map((f: any) => [f.name, f.id]))

  const items = articles.map((article) => {
    const fieldData: Record<string, any> = {}
    const set = (name: string, value: any) => {
      const id = fieldMap.get(name)
      if (id) fieldData[id] = value
    }
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
  const [categories, setCategories] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  // Load article count + categories on mount
  useEffect(() => {
    fetch(`${SYNC_ENDPOINT}?status=published`, {
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
    })
      .then((r) => r.json())
      .then((d) => {
        setCategories(d.categories ?? [])
        setTotalCount(d.count ?? null)
      })
      .catch(() => {})
  }, [])

  async function handleSync() {
    setSyncing(true)
    setStatus("syncing")
    setMessage("")
    try {
      const collection = await framer.getManagedCollection()
      if (!collection) throw new Error("No managed collection found. Add this plugin via CMS → Add Plugin first.")

      const { count } = await doSync(collection, selectedCategory)
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      setLastSync(time)
      setStatus("success")
      setMessage(count === 0 ? "No articles found for that filter." : `${count} article${count !== 1 ? "s" : ""} synced.`)
      framer.notify(count > 0 ? `Synced ${count} article(s) ✓` : "No articles found.")
    } catch (err: any) {
      setStatus("error")
      setMessage(err?.message ?? "Sync failed.")
      framer.notify("Sync failed — see plugin for details")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.logoWrap}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <rect width="20" height="20" rx="5" fill="#0066FF" />
            <path d="M5 5h10v3.5H8.5V10H14v3H8.5v2H5V5z" fill="white" />
          </svg>
        </div>
        <div>
          <div style={s.title}>Skill Studio</div>
          <div style={s.subtitle}>ContentLab → Framer CMS</div>
        </div>
        {totalCount !== null && (
          <div style={s.badge}>{totalCount} articles</div>
        )}
      </div>

      <div style={s.divider} />

      {/* Category picker */}
      <label style={s.label}>Filter by category</label>
      <select
        style={s.select}
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value)}
        disabled={syncing}
      >
        <option value="all">All categories</option>
        {categories.map((cat) => (
          <option key={cat} value={cat}>{cat}</option>
        ))}
      </select>

      {/* Sync button */}
      <button
        style={{ ...s.button, ...(syncing ? s.buttonDisabled : {}) }}
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? (
          <><span style={s.spinner} />Syncing…</>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ marginRight: 6 }}>
              <path d="M7 1.5A5.5 5.5 0 1 1 1.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M1.5 4V7H4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sync from ContentLab
          </>
        )}
      </button>

      {/* Status message */}
      {message && (
        <div style={{ ...s.msg, ...(status === "error" ? s.msgError : s.msgSuccess) }}>
          {status === "error" ? "⚠ " : "✓ "}{message}
        </div>
      )}

      {/* Last sync */}
      {lastSync && (
        <div style={s.lastSync}>Last synced at {lastSync}</div>
      )}

      <div style={s.divider} />

      <p style={s.hint}>
        First time? Add this plugin to your CMS collection via <strong>CMS → Add Plugin</strong>, then click Sync.
      </p>
    </main>
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
  select: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--framer-color-divider,#ddd)", background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", fontSize: 13, cursor: "pointer", outline: "none" },
  button: { display: "flex", alignItems: "center", justifyContent: "center", background: "#0066FF", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 2 },
  buttonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  spinner: { width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", marginRight: 8, display: "inline-block" },
  msg: { fontSize: 12, borderRadius: 6, padding: "8px 10px", lineHeight: 1.5 },
  msgSuccess: { background: "#e6f4ea", color: "#1a6b35" },
  msgError: { background: "#fdecea", color: "#8b1a1a" },
  lastSync: { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", textAlign: "center" },
  hint: { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", lineHeight: 1.5, margin: 0 },
}

if (typeof document !== "undefined") {
  const st = document.createElement("style")
  st.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`
  document.head.appendChild(st)
}
