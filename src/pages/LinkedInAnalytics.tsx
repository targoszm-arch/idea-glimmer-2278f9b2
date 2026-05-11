import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Linkedin, TrendingUp, TrendingDown, RefreshCw, AlertCircle, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { useLinkedInExtension } from "@/hooks/useLinkedInExtension";
import { useToast } from "@/hooks/use-toast";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

type Snapshot = {
  id: string;
  kind: "profile" | "company";
  company_id: string | null;
  data: any;
  fetched_at: string;
};

type Post = {
  activityId: string;
  text: string;
  reactions: number;
  comments: number;
  reshares: number;
  impressions: number;
  permalink: string;
  postedAt: number | null;
  mediaType: string;
};

const CPM_DEFAULT = 35;

function parseNum(s: any): number | null {
  if (typeof s === "number") return s;
  if (typeof s !== "string") return null;
  const cleaned = s.replace(/,/g, "").trim();
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);
  // "1.2K", "8.5M"
  const m = cleaned.match(/^(-?[\d.]+)([KkMmBb])$/);
  if (m) {
    const n = parseFloat(m[1]);
    const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()] || 1;
    return n * mult;
  }
  return null;
}

// Pulls the creator-dashboard analytics previews keyed by their type. This is
// where LinkedIn returns followers / post impressions / profile views / etc.
function extractCreatorMetrics(profileData: any): Record<string, { value: number; changePct: number | null; url: string }> {
  const sections: any[] = profileData?.analytics?.data?.feedDashCreatorExperienceDashboard?.section || [];
  const previews = sections.flatMap((s) => s?.analyticsSection?.analyticsPreviews || []).filter(Boolean);
  const out: Record<string, { value: number; changePct: number | null; url: string }> = {};
  for (const p of previews) {
    const type = p.creatorAnalyticsType;
    const value = parseNum(p.analyticsTitle?.text);
    if (!type || value == null) continue;
    out[type] = { value, changePct: typeof p.changeInValue === "number" ? p.changeInValue : null, url: p.navigationUrl || "" };
  }
  return out;
}

// LinkedIn activity URN id encodes ms timestamp in upper 41 bits (id >> 22 = ms).
function activityIdToTimestamp(id: string): number | null {
  try {
    const big = BigInt(id);
    const ts = Number(big >> 22n);
    if (ts > 1_000_000_000_000 && ts < 4_000_000_000_000) return ts;
  } catch { /* ignore */ }
  return null;
}

function extractPosts(postsResponse: any): Post[] {
  const elements: any[] =
    postsResponse?.data?.feedDashProfileUpdatesByMemberShareFeed?.elements ||
    postsResponse?.data?.elements || [];
  return elements.map((el) => {
    const c = el?.socialDetail?.totalSocialActivityCounts || {};
    const urn = el?.metadata?.backendUrn || el?.updateMetadata?.backendUrn || "";
    const activityId = String(urn).split(":").pop() || "";
    const postedAt = activityIdToTimestamp(activityId);
    const text =
      el?.commentary?.text?.text ||
      el?.commentary?.text ||
      el?.content?.commentary?.text?.text || "";
    const content = el?.content || {};
    const mediaType =
      content.linkedInVideoComponent ? "video" :
      content.externalVideoComponent ? "video" :
      content.imageComponent ? "image" :
      content.documentComponent ? "document" :
      content.articleComponent ? "article" :
      content.pollComponent ? "poll" :
      content.eventComponent ? "event" :
      "text";
    return {
      activityId,
      text: String(text),
      reactions: typeof c.numLikes === "number" ? c.numLikes : 0,
      comments: typeof c.numComments === "number" ? c.numComments : 0,
      reshares: typeof c.numShares === "number" ? c.numShares : 0,
      impressions: typeof c.numImpressions === "number" ? c.numImpressions : 0,
      permalink: el?.socialContent?.shareUrl || (activityId ? `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}/` : ""),
      postedAt,
      mediaType,
    };
  });
}

function fmt(n: number | null | undefined, abbr = true): string {
  if (n == null) return "—";
  if (!abbr) return n.toLocaleString();
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtUSD(n: number | null): string {
  if (n == null) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDate(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString();
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null || !isFinite(pct)) return <span className="text-muted-foreground text-xs">—</span>;
  const positive = pct >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-green-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />{positive ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function PostRow({ p }: { p: Post }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center text-xs border-b py-2 last:border-b-0">
      <div className="col-span-1 text-muted-foreground tabular-nums">{fmtDate(p.postedAt)}</div>
      <div className="col-span-5 truncate" title={p.text}>
        <span className="text-[10px] uppercase text-muted-foreground mr-1.5">{p.mediaType}</span>
        {p.text.slice(0, 120) || "(no text)"}
      </div>
      <div className="col-span-1 text-right tabular-nums">{fmt(p.impressions)}</div>
      <div className="col-span-1 text-right tabular-nums">{fmt(p.reactions)}</div>
      <div className="col-span-1 text-right tabular-nums">{fmt(p.comments)}</div>
      <div className="col-span-1 text-right tabular-nums">{fmt(p.reshares)}</div>
      <div className="col-span-2 text-right">
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            View <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function PostTableHeader() {
  return (
    <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-muted-foreground border-b pb-1.5 font-medium">
      <div className="col-span-1">Date</div>
      <div className="col-span-5">Post</div>
      <div className="col-span-1 text-right">📊 Imp</div>
      <div className="col-span-1 text-right">❤️ React</div>
      <div className="col-span-1 text-right">💬 Cmt</div>
      <div className="col-span-1 text-right">🔁 Re</div>
      <div className="col-span-2 text-right"></div>
    </div>
  );
}

export default function LinkedInAnalytics() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [postSort, setPostSort] = useState<"date" | "impressions" | "reactions" | "comments" | "reshares">("date");
  const { available: extAvailable, refresh: extRefresh, refreshing } = useLinkedInExtension();
  const { toast } = useToast();

  async function load() {
    const { data } = await supabase
      .from("linkedin_snapshots" as any)
      .select("*")
      .order("fetched_at", { ascending: false });
    setSnapshots(((data as any) || []) as Snapshot[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleRefresh() {
    const result = await extRefresh();
    if (!result.ok) {
      toast({ title: "Refresh failed", description: result.error || "Unknown error", variant: "destructive" });
      return;
    }
    toast({ title: "Synced from LinkedIn" });
    await load();
  }

  const profile = useMemo(() => snapshots.find((s) => s.kind === "profile")?.data ?? null, [snapshots]);
  const companies = useMemo(() => snapshots.filter((s) => s.kind === "company").map((s) => s.data), [snapshots]);
  const metrics = useMemo(() => extractCreatorMetrics(profile), [profile]);
  const posts = useMemo(() => (profile ? extractPosts(profile.posts) : []), [profile]);

  const followers = metrics.TOTAL_FOLLOWERS?.value ?? 0;
  const followersChange = metrics.TOTAL_FOLLOWERS?.changePct ?? null;
  const impressions = metrics.POST_IMPRESSIONS?.value ?? posts.reduce((s, p) => s + p.impressions, 0);
  const impressionsChange = metrics.POST_IMPRESSIONS?.changePct ?? null;
  const profileViews = metrics.PROFILE_VIEWS?.value ?? null;
  const newsletterSubs = metrics.NEWSLETTER_SUBSCRIBERS?.value ?? null;
  const newsletterViews = metrics.ARTICLE_VIEWS?.value ?? null;
  const searchAppearances = metrics.SEARCH_APPEARANCES?.value ?? null;
  const connections = posts.length === 0 ? 0 : null; // not yet wired

  const totalReactions = posts.reduce((s, p) => s + p.reactions, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments, 0);
  const totalReshares = posts.reduce((s, p) => s + p.reshares, 0);

  const postsLast30d = posts.filter((p) => p.postedAt && Date.now() - p.postedAt < 30 * 24 * 60 * 60 * 1000).length;
  const postsPerWeek = postsLast30d > 0 ? +(postsLast30d / (30 / 7)).toFixed(1) : 0;
  const earnedMediaValue = impressions > 0 ? (impressions * CPM_DEFAULT) / 1000 : 0;

  const sortedPosts = useMemo(() => {
    const arr = [...posts];
    arr.sort((a, b) => {
      if (postSort === "date") return (b.postedAt || 0) - (a.postedAt || 0);
      return (b[postSort] || 0) - (a[postSort] || 0);
    });
    return arr;
  }, [posts, postSort]);

  const topByMetric = (metric: "impressions" | "reactions" | "comments" | "reshares") =>
    [...posts].sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, 5);

  const followerHistory = useMemo(() => {
    return snapshots
      .filter((s) => s.kind === "profile")
      .map((s) => {
        const m = extractCreatorMetrics(s.data);
        return {
          date: new Date(s.fetched_at).toLocaleDateString(),
          followers: m.TOTAL_FOLLOWERS?.value ?? 0,
          impressions: m.POST_IMPRESSIONS?.value ?? 0,
        };
      })
      .reverse();
  }, [snapshots]);

  const engagementsByPost = useMemo(() =>
    sortedPosts.slice(0, 25).map((p, i) => ({
      i: i + 1,
      reactions: p.reactions,
      comments: p.comments,
      reshares: p.reshares,
      _post: p,
    })), [sortedPosts]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      </PageLayout>
    );
  }

  if (!profile && companies.length === 0) {
    return (
      <PageLayout>
        <div className="max-w-5xl mx-auto px-4 py-10 text-center">
          <Linkedin className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-2xl font-bold mb-2">No LinkedIn data yet</h1>
          <p className="text-muted-foreground mb-4">Install the LinkedIn Browser Extension and connect it in Settings to start syncing analytics.</p>
          <a href="/settings/integrations" className="text-primary underline text-sm">Go to Integrations →</a>
        </div>
      </PageLayout>
    );
  }

  const lastSync = snapshots[0]?.fetched_at;
  const staleHours = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 3_600_000 : Infinity;
  const isStale = staleHours > 24;

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">LinkedIn Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {lastSync ? `Last synced ${new Date(lastSync).toLocaleString()}` : "No data synced yet"}
              {extAvailable === false && " · Extension not detected"}
            </p>
          </div>
          {extAvailable && (
            <Button onClick={handleRefresh} disabled={refreshing} size="sm">
              <RefreshCw className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Syncing…" : "Refresh now"}
            </Button>
          )}
        </div>

        {extAvailable === false && (
          <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs">
            <AlertCircle className="h-4 w-4 text-yellow-700 mt-0.5" />
            <div>
              <div className="font-medium text-yellow-900">LinkedIn Browser Extension not detected on this page.</div>
              <div className="text-yellow-800">
                Install it from <a href="/settings/integrations" className="underline">Settings → Integrations</a> to enable one-click refresh.
              </div>
            </div>
          </div>
        )}

        {isStale && extAvailable && (
          <div className="flex items-center justify-between rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-700" />
              <span className="text-yellow-900">Data is more than {Math.floor(staleHours / 24)} day(s) old.</span>
            </div>
            <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        )}

        {/* Top row: Activity + Earned Media Value */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Activity <span className="text-xs font-normal text-muted-foreground">Last 30 days</span></CardTitle></CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">{postsPerWeek >= 3 ? "You're posting more than usual" : postsPerWeek > 0 ? "Steady cadence" : "No recent posts detected"}</div>
              <div className="text-4xl font-bold tabular-nums">{postsPerWeek}<span className="text-base font-normal text-muted-foreground"> posts/week</span></div>
              <div className="mt-4 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (postsPerWeek / 10) * 100)}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground uppercase tracking-wide">{posts.length} total posts in snapshot</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Earned media value <span className="text-xs font-normal text-muted-foreground">Based on {fmt(impressions)} impressions</span></CardTitle></CardHeader>
            <CardContent>
              <div className="text-4xl font-bold tabular-nums">{fmtUSD(earnedMediaValue)}</div>
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">CPM</span>
                <span className="font-medium">${CPM_DEFAULT}</span>
              </div>
              <div className="mt-1 h-2 bg-muted rounded overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (CPM_DEFAULT / 100) * 100)}%` }} />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Middle row: Impressions + Followers */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Impressions <Delta pct={impressionsChange} /></CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2 tabular-nums">{fmt(impressions)}</div>
              <div className="h-40">
                {followerHistory.length >= 2 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={followerHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Area type="monotone" dataKey="impressions" stroke="#0A66C2" fill="#0A66C2" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Trend fills in after multiple syncs.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Followers <Delta pct={followersChange} /></CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2 tabular-nums">{fmt(followers)}</div>
              <div className="h-40">
                {followerHistory.length >= 2 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={followerHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="followers" stroke="#0A66C2" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Trend fills in after multiple syncs.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Engagements with click-to-drill bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              Engagements per post
              <div className="text-xs font-normal text-muted-foreground space-x-3">
                <span>🔁 {totalReshares}</span><span>💬 {totalComments}</span><span>❤️ {totalReactions}</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-44">
              {engagementsByPost.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={engagementsByPost}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="i" tick={{ fontSize: 10 }} label={{ value: "Posts (sorted by latest)", position: "insideBottom", offset: -2, style: { fontSize: 10, fill: "#888" } }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.[0]?.payload?._post) return null;
                      const p: Post = payload[0].payload._post;
                      return (
                        <div className="bg-white border rounded shadow-md p-2 text-xs max-w-xs">
                          <div className="font-medium truncate">{p.text.slice(0, 80) || "(no text)"}</div>
                          <div className="text-muted-foreground">{fmtDate(p.postedAt)}</div>
                          <div className="mt-1">❤️ {p.reactions} 💬 {p.comments} 🔁 {p.reshares} 📊 {p.impressions}</div>
                          {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-primary underline mt-1 block">Open on LinkedIn</a>}
                        </div>
                      );
                    }} />
                    <Bar dataKey="reactions" stackId="a" fill="#0A66C2" />
                    <Bar dataKey="comments" stackId="a" fill="#057642" />
                    <Bar dataKey="reshares" stackId="a" fill="#915EFF" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No posts yet.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* KPI table with click-to-drill */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">KPI summary — click a row to see the top posts driving it</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 w-8"></th>
                <th className="text-left">Metric</th>
                <th className="text-right">Value</th>
                <th className="text-right">Δ 7d</th>
                <th className="text-right">LinkedIn</th>
              </tr></thead>
              <tbody className="divide-y">
                {([
                  { key: "impressions", label: "Post impressions (7d)", value: impressions, change: impressionsChange, url: metrics.POST_IMPRESSIONS?.url, drill: true },
                  { key: "TOTAL_FOLLOWERS", label: "Followers", value: followers, change: followersChange, url: metrics.TOTAL_FOLLOWERS?.url, drill: false },
                  { key: "PROFILE_VIEWS", label: "Profile views (90d)", value: profileViews, change: metrics.PROFILE_VIEWS?.changePct ?? null, url: metrics.PROFILE_VIEWS?.url, drill: false },
                  { key: "SEARCH_APPEARANCES", label: "Search appearances (7d)", value: searchAppearances, change: metrics.SEARCH_APPEARANCES?.changePct ?? null, url: metrics.SEARCH_APPEARANCES?.url, drill: false },
                  { key: "NEWSLETTER_SUBSCRIBERS", label: "Newsletter subscribers", value: newsletterSubs, change: metrics.NEWSLETTER_SUBSCRIBERS?.changePct ?? null, url: metrics.NEWSLETTER_SUBSCRIBERS?.url, drill: false },
                  { key: "ARTICLE_VIEWS", label: "Newsletter article views", value: newsletterViews, change: metrics.ARTICLE_VIEWS?.changePct ?? null, url: metrics.ARTICLE_VIEWS?.url, drill: false },
                  { key: "reactions", label: "Total reactions (in synced posts)", value: totalReactions, change: null, url: "", drill: true },
                  { key: "comments", label: "Total comments (in synced posts)", value: totalComments, change: null, url: "", drill: true },
                  { key: "reshares", label: "Total reposts (in synced posts)", value: totalReshares, change: null, url: "", drill: true },
                ] as const).map((row) => (
                  <FragmentRow
                    key={row.key}
                    row={row}
                    expanded={expanded === row.key}
                    onToggle={() => setExpanded(expanded === row.key ? null : row.key)}
                    drilldown={row.drill ? topByMetric(row.key as any) : []}
                  />
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-2">Click rows for a drilldown to the top 5 posts driving that metric. "LinkedIn" links open the official analytics page.</p>
          </CardContent>
        </Card>

        {/* All posts table */}
        {posts.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                All posts ({posts.length})
                <div className="flex gap-1">
                  {(["date", "impressions", "reactions", "comments", "reshares"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setPostSort(s)}
                      className={`text-[10px] uppercase px-2 py-1 rounded ${postSort === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PostTableHeader />
              <div className="max-h-96 overflow-y-auto">
                {sortedPosts.map((p) => <PostRow key={p.activityId} p={p} />)}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Companies */}
        {companies.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Company pages ({companies.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {companies.map((c: any) => (
                <div key={c.id || c.universalName} className="border-b pb-3 last:border-b-0">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      {c.logoUrl && <img src={c.logoUrl} className="h-8 w-8 rounded" />}
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name || c.universalName}</div>
                        {c.tagline && <div className="text-xs text-muted-foreground truncate">{c.tagline}</div>}
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      <span>👥 {fmt(c.followerCount)}</span>
                      {c.staffCount != null && <span>👔 {fmt(c.staffCount)} staff</span>}
                      {c.universalName && (
                        <a href={`https://www.linkedin.com/company/${c.universalName}/`} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                          Open <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {Array.isArray(c.posts) && c.posts.length > 0 && (
                    <div className="mt-2">
                      <PostTableHeader />
                      {c.posts.slice(0, 10).map((p: Post) => <PostRow key={p.activityId} p={p} />)}
                    </div>
                  )}
                  {!c.posts && (
                    <div className="text-[11px] text-muted-foreground mt-1">Post-level data for company pages requires a Refresh after extension v1.4.0.</div>
                  )}
                  {c.error && (
                    <div className="text-[11px] text-red-600 mt-1">Error: {c.error}</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}

function FragmentRow({ row, expanded, onToggle, drilldown }: {
  row: { key: string; label: string; value: number | null; change: number | null; url: string; drill: boolean };
  expanded: boolean;
  onToggle: () => void;
  drilldown: Post[];
}) {
  return (
    <>
      <tr
        className={row.drill ? "cursor-pointer hover:bg-muted/50" : ""}
        onClick={row.drill ? onToggle : undefined}
      >
        <td className="py-2">
          {row.drill && (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
        </td>
        <td className="py-2">{row.label}</td>
        <td className="text-right tabular-nums font-medium">{row.value == null ? "—" : fmt(row.value)}</td>
        <td className="text-right"><Delta pct={row.change} /></td>
        <td className="text-right">
          {row.url && (
            <a href={row.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:underline inline-flex items-center gap-0.5 text-xs">
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </td>
      </tr>
      {expanded && drilldown.length > 0 && (
        <tr><td colSpan={5} className="bg-muted/30 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Top 5 posts by {row.key}</div>
          <PostTableHeader />
          {drilldown.map((p) => <PostRow key={p.activityId} p={p} />)}
        </td></tr>
      )}
    </>
  );
}
