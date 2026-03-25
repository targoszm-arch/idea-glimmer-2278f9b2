import React, { useState, useEffect } from "react"
import { framer } from "framer-plugin"
import { SYNC_ENDPOINT, SUPABASE_ANON_KEY, REGISTER_ENDPOINT } from "./config"

type Article = {
  id: string; title: string; slug: string; content: string
  excerpt: string; meta_description: string; category: string
  cover_image_url: string | null; created_at: string
}

import { PLUGIN_DATA_KEY } from "./constants"

const SIGNUP_URL = "https://www.app.content-lab.ie/signup"

const F = {
  title:       "Title",
  body:        "Content",
  excerpt:     "Excerpt",
  category:    "Category",
  metaDesc:    "Meta Description",
  pubDate:     "Publication Date",
  image:       "Preview Image",
  readingTime: "Reading Time",
  author:      "Author",
} as const

const FIELDS = [
  { id: F.title,    name: "Title",            type: "string" as const },
  { id: F.body,     name: "Body (Rich Text)",  type: "formattedText" as const },
  { id: F.excerpt,  name: "Excerpt",          type: "string" as const },
  { id: F.category, name: "Category",         type: "string" as const },
  { id: F.metaDesc, name: "Meta Description", type: "string" as const },
  { id: F.pubDate,  name: "Published Date",   type: "date" as const },
  { id: F.image,       name: "Cover Image",      type: "image" as const },
  { id: F.readingTime, name: "Reading Time (min)", type: "number" as const },
  { id: F.author,      name: "Author",             type: "string" as const },
]

export async function configureManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) return
  if (!framer.isAllowedTo("ManagedCollection.setFields")) {
    framer.notify("Permission denied — please re-open the plugin")
    return
  }
  await collection.setFields(FIELDS)
  framer.notify("ContentLab: Collection configured ✓")
}

export async function syncManagedCollection() {
  const collection = await framer.getManagedCollection()
  if (!collection) return
  if (framer.isAllowedTo("ManagedCollection.setFields")) {
    await collection.setFields(FIELDS)
  }
  try {
    const count = await syncArticles(collection, "all")
    framer.notify(count > 0 ? `Synced ${count} article(s) ✓` : "No articles to sync.")
  } catch (e: any) {
    framer.notify(`Sync failed: ${e?.message ?? "error"}`)
  }
}

function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "article"
}

export async function syncArticles(collection: any, category: string, apiKey?: string): Promise<number> {
  const param = category !== "all" ? `&category=${encodeURIComponent(category)}` : ""
  const key = apiKey || SUPABASE_ANON_KEY
  const res = await fetch(`${SYNC_ENDPOINT}?status=published${param}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: SUPABASE_ANON_KEY },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const { articles } = await res.json() as { articles: Article[] }

  // ── Reconcile: remove Framer items that no longer exist in ContentLab ──
  const contentLabIds = new Set((articles ?? []).map((a: Article) => a.id))
  const framerItemIds = await collection.getItemIds()
  const toRemove = framerItemIds.filter((id: string) => !contentLabIds.has(id))
  if (toRemove.length > 0) {
    await collection.removeItems(toRemove)
  }

  if (!articles?.length) return 0

  const items = articles.map((a) => ({
    id: a.id,
    slug: toSlug(a.slug || a.title || a.id),
    fieldData: {
      [F.title]:       { type: "string" as const,        value: a.title ?? "" },
      [F.body]:        { type: "formattedText" as const, value: a.content ?? "" },
      [F.excerpt]:     { type: "string" as const,        value: a.excerpt ?? "" },
      [F.category]:    { type: "string" as const,        value: a.category ?? "" },
      [F.metaDesc]:    { type: "string" as const,        value: a.meta_description ?? "" },
      [F.pubDate]:     { type: "date" as const,          value: a.created_at ?? "" },
      ...(a.cover_image_url
        ? { [F.image]: { type: "image" as const, value: a.cover_image_url } }
        : {}),
      [F.readingTime]: { type: "number" as const,        value: a.reading_time_minutes ?? 0 },
      [F.author]:      { type: "string" as const,        value: a.author_name ?? "" },
    },
  }))

  framer.isAllowedTo("ManagedCollection.addItems")
  await collection.addItems(items)
  return items.length
}

// ── App ───────────────────────────────────────────────────────────────────────

const FIELD_DEFS = [
  { key: "title",       label: "Title",              default: "Title" },
  { key: "body",        label: "Body (Rich Text)",   default: "Content" },
  { key: "excerpt",     label: "Excerpt",            default: "Excerpt" },
  { key: "category",    label: "Category",           default: "Category" },
  { key: "metaDesc",    label: "Meta Description",   default: "Meta Description" },
  { key: "pubDate",     label: "Published Date",     default: "Publication Date" },
  { key: "image",       label: "Cover Image",        default: "Preview Image" },
  { key: "readingTime", label: "Reading Time (min)", default: "Reading Time" },
  { key: "author",      label: "Author",             default: "Author" },
] as const

const STORAGE_KEY = "contentlab_field_mapping"

function FieldMappingEditor() {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const saved = framer.getPluginData(STORAGE_KEY)
    if (saved) { try { return JSON.parse(saved) } catch {} }
    return Object.fromEntries(FIELD_DEFS.map(f => [f.key, f.default]))
  })
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [tempValue, setTempValue] = useState("")
  const [dirty, setDirty] = useState(false)

  async function save() {
    await framer.setPluginData(STORAGE_KEY, JSON.stringify(mapping))
    framer.notify("Field mapping saved ✓")
    setDirty(false)
  }

  function startEdit(key: string) {
    setEditingKey(key)
    setTempValue(mapping[key])
  }

  function commit(key: string) {
    const val = tempValue.trim()
    if (val) { setMapping(m => ({ ...m, [key]: val })); setDirty(true) }
    setEditingKey(null)
  }

  function reset() {
    setMapping(Object.fromEntries(FIELD_DEFS.map(f => [f.key, f.default])))
    setDirty(true)
  }

  return (
    <div style={{ fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontWeight: 600, color: "var(--framer-color-text,#111)" }}>Field Mapping</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={reset} style={{ fontSize: 10, background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: 0 }}>Reset</button>
          {dirty && <button onClick={save} style={{ fontSize: 10, background: "#2563EB", color: "white", border: "none", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>Save</button>}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#bbb", marginBottom: 3, padding: "0 2px" }}>
        <span>Column</span><span>Field</span>
      </div>
      {FIELD_DEFS.map(({ key, label }) => (
        <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 2px", borderBottom: "1px solid var(--framer-color-divider,#eee)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flex: 1 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: "#2563EB", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4h5M4 1.5l2.5 2.5L4 6.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ color: "var(--framer-color-text,#111)" }}>{label}</span>
          </div>
          {editingKey === key ? (
            <input
              value={tempValue}
              onChange={e => setTempValue(e.target.value)}
              onBlur={() => commit(key)}
              onKeyDown={e => { if (e.key === "Enter") commit(key); if (e.key === "Escape") setEditingKey(null) }}
              autoFocus
              style={{ fontSize: 11, width: 120, padding: "2px 6px", border: "1.5px solid #2563EB", borderRadius: 4, outline: "none", background: "#EFF6FF", color: "#1E40AF" }}
            />
          ) : (
            <span
              onClick={() => startEdit(key)}
              title="Click to rename"
              style={{ fontSize: 11, color: "var(--framer-color-text,#111)", background: "var(--framer-color-bg-secondary,#f5f5f5)", border: "1px solid var(--framer-color-divider,#e5e5e5)", borderRadius: 4, padding: "2px 8px", cursor: "pointer", minWidth: 80, textAlign: "center" }}
            >
              {mapping[key]}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}


export default function App() {
  const [screen, setScreen] = useState<"loading"|"onboard"|"sync">("loading")
  const [apiKey, setApiKey] = useState("")
  const [savedKey, setSavedKey] = useState("")
  const [keyError, setKeyError] = useState("")
  const [status, setStatus] = useState<"idle"|"syncing"|"success"|"error">("idle")
  const [message, setMessage] = useState("")
  const [categories, setCategories] = useState<string[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [lastSync, setLastSync] = useState<string | null>(null)

  useEffect(() => {
    // ONLY skip onboarding if a saved API key exists
    framer.getPluginData(PLUGIN_DATA_KEY).then(key => {
      if (key && key.trim()) {
        setSavedKey(key.trim())
        setApiKey(key.trim())
        setScreen("sync")
        loadArticleCount(key.trim())
      } else {
        setScreen("onboard")
      }
    })
  }, [])

  function loadArticleCount(key: string) {
    // Only fetch if we have a real API key — never fall back to anon key
    if (!key || !key.startsWith("cl_")) return
    fetch(`${SYNC_ENDPOINT}?status=published`, {
      headers: { Authorization: `Bearer ${key}`, apikey: SUPABASE_ANON_KEY },
    })
      .then(r => r.json())
      .then(d => { setCategories(d.categories ?? []); setTotalCount(d.count ?? null) })
      .catch(() => {})
  }

  async function handleNext() {
    const trimmed = apiKey.trim()
    if (!trimmed) { setKeyError("Please enter your API key"); return }
    // Save key to plugin data
    await framer.setPluginData(PLUGIN_DATA_KEY, trimmed)
    setSavedKey(trimmed)
    setKeyError("")
    setScreen("sync")

    // Auto-register: capture collection ID and project info, send to backend
    try {
      const collection = await framer.getManagedCollection()
      const collectionId = collection?.id ?? null

      let projectName: string | null = null
      try {
        const info = await (framer as any).getProjectInfo?.()
        projectName = info?.name ?? null
      } catch { /* getProjectInfo may not be available */ }

      const regRes = await fetch(REGISTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${trimmed}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          collection_id: collectionId,
          project_name: projectName,
        }),
      })
      if (!regRes.ok) {
        const regData = await regRes.json().catch(() => ({}))
        console.error("Plugin registration failed:", regData)
        framer.notify(`Registration failed: ${regData.error || "Unknown error"}`, { variant: "error" })
      }
    } catch (e) {
      console.warn("Auto-register failed (non-blocking):", e)
    }

    loadArticleCount(trimmed)
  }

  async function handleSync() {
    setStatus("syncing"); setMessage("")
    try {
      const collection = await framer.getManagedCollection()
      if (!collection) throw new Error("No collection — add plugin via CMS → Add Plugin first.")
      if (framer.isAllowedTo("ManagedCollection.setFields")) {
        await collection.setFields(FIELDS)
      }
      const count = await syncArticles(collection, selectedCategory, savedKey)
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
      setStatus("success")
      setMessage(count === 0 ? "No articles found." : `${count} article${count !== 1 ? "s" : ""} synced.`)
    } catch (err: any) {
      setStatus("error")
      setMessage(err?.message ?? "Sync failed.")
    }
  }

  function handleDisconnect() {
    framer.setPluginData(PLUGIN_DATA_KEY, "")
    setSavedKey("")
    setApiKey("")
    setScreen("onboard")
    setStatus("idle")
    setMessage("")
  }

  const syncing = status === "syncing"

  // ── Loading ──────────────────────────────────────────────────────────────
  if (screen === "loading") return <main style={s.root}><div style={s.loading}>Loading…</div></main>

  // ── Onboarding ───────────────────────────────────────────────────────────
  if (screen === "onboard") return (
    <main style={s.root}>
      {/* Logo */}
      <div style={s.logoWrap}>
        <img src="/icon.png" width={52} height={52} style={{ borderRadius: 12 }} alt="ContentLab" />
      </div>

      <div style={s.onboardTitle}>ContentLab</div>
      <div style={s.onboardSub}>
        Connect your ContentLab collection set to sync articles to Framer.
      </div>

      <a href={SIGNUP_URL} target="_blank" rel="noreferrer" style={s.visitLink}>
        Visit ContentLab Website →
      </a>

      <div style={s.divider}/>

      {/* Source picker */}
      <select style={{ ...s.select, width: "100%", boxSizing: "border-box" }}>
        <option>ContentLab — Blog Articles</option>
      </select>

      {/* API Key */}
      <div style={s.fieldRow}>
        <span style={s.fieldLabel}>API Key</span>
        <input
          style={{ ...s.input, ...(keyError ? s.inputErr : {}) }}
          type="text"
          placeholder="Enter your API key"
          value={apiKey}
          onChange={e => { setApiKey(e.target.value); setKeyError("") }}
        />
      </div>
      {keyError && <div style={s.errText}>{keyError}</div>}

      <button style={s.nextBtn} onClick={handleNext}>Next</button>

      <p style={s.hint}>
        Don't have an account?{" "}
        <a href={SIGNUP_URL} target="_blank" rel="noreferrer" style={{ color: "#2563EB" }}>
          Sign up free →
        </a>
      </p>
    </main>
  )

  // ── Sync screen ──────────────────────────────────────────────────────────
  return (
    <main style={s.root}>
      <div style={s.header}>
        <img src="/icon.png" width={24} height={24} style={{ borderRadius: 6, flexShrink: 0 }} alt="" />
        <div style={{ flex: 1 }}>
          <div style={s.title}>ContentLab</div>
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

      <div style={{ fontSize: 11, color: "var(--framer-color-text-tertiary,#999)" }}>
        <div style={{ marginBottom: 4, fontWeight: 600 }}>API Key</div>
        <div style={{ fontFamily: "monospace", background: "var(--framer-color-bg-secondary,#f5f5f5)", borderRadius: 6, padding: "4px 8px", fontSize: 10, wordBreak: "break-all" }}>
          {savedKey || "No key saved"}
        </div>
      </div>

      <FieldMappingEditor />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href={SIGNUP_URL} target="_blank" rel="noreferrer" style={{ ...s.visitLink, fontSize: 11 }}>
          Visit ContentLab →
        </a>
        <button onClick={handleDisconnect} style={s.disconnectBtn}>Disconnect</button>
      </div>
    </main>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:          { fontFamily: "system-ui,sans-serif", padding: 20, display: "flex", flexDirection: "column", gap: 12, background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", minHeight: "100vh", boxSizing: "border-box" },
  loading:       { textAlign: "center", color: "#999", marginTop: 40 },
  logoWrap:      { display: "flex", justifyContent: "center", marginTop: 8 },
  onboardTitle:  { textAlign: "center", fontWeight: 700, fontSize: 16 },
  onboardSub:    { textAlign: "center", fontSize: 13, color: "var(--framer-color-text-secondary,#555)", lineHeight: 1.5 },
  visitLink:     { textAlign: "center", color: "#2563EB", fontSize: 13, textDecoration: "none", cursor: "pointer" },
  divider:       { height: 1, background: "var(--framer-color-divider,#eee)" },
  selectWrap:    { width: "100%" },
  select:        { width: "100%", padding: "8px 10px", height: 36, borderRadius: 8, border: "1px solid var(--framer-color-divider,#ddd)", background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", fontSize: 13, appearance: "auto" },
  fieldRow:      { display: "flex", alignItems: "center", gap: 10 },
  fieldLabel:    { fontSize: 13, color: "var(--framer-color-text-secondary,#555)", width: 56, flexShrink: 0 },
  input:         { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--framer-color-divider,#ddd)", background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", fontSize: 13, outline: "none" },
  inputErr:      { borderColor: "#e53e3e" },
  errText:       { fontSize: 11, color: "#e53e3e", marginTop: -6 },
  nextBtn:       { background: "var(--framer-color-bg,#fff)", color: "var(--framer-color-text,#111)", border: "1px solid var(--framer-color-divider,#ddd)", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 500, cursor: "pointer", width: "100%" },
  hint:          { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", textAlign: "center", lineHeight: 1.5, margin: 0 },
  header:        { display: "flex", alignItems: "center", gap: 10 },
  title:         { fontWeight: 700, fontSize: 13 },
  sub:           { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)" },
  badge:         { marginLeft: "auto", background: "var(--framer-color-bg-secondary,#f0f0f0)", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
  label:         { fontSize: 11, fontWeight: 600, color: "var(--framer-color-text-secondary,#666)", textTransform: "uppercase", letterSpacing: "0.05em" },
  btn:           { background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" },
  btnOff:        { opacity: 0.5, cursor: "not-allowed" },
  msg:           { fontSize: 12, borderRadius: 6, padding: "8px 10px" },
  msgOk:         { background: "#e6f4ea", color: "#1a6b35" },
  msgErr:        { background: "#fdecea", color: "#8b1a1a" },
  meta:          { fontSize: 11, color: "var(--framer-color-text-tertiary,#999)", textAlign: "center" },
  disconnectBtn: { background: "none", border: "none", fontSize: 11, color: "#999", cursor: "pointer", padding: 0 },
}
