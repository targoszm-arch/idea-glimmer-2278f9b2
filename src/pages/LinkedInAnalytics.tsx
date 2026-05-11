import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageLayout from "@/components/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Linkedin, TrendingUp, TrendingDown, RefreshCw, AlertCircle } from "lucide-react";
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

const CPM_DEFAULT = 35;

function findNumber(obj: any, keys: string[], depth = 0): number | null {
  if (!obj || depth > 6 || typeof obj !== "object") return null;
  for (const k of keys) {
    if (typeof obj[k] === "number") return obj[k];
    if (typeof obj[k] === "string" && /^\d+$/.test(obj[k])) return parseInt(obj[k], 10);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const f = findNumber(v, keys, depth + 1);
      if (f != null) return f;
    }
  }
  return null;
}

function extractPostList(postsResponse: any): Array<{ text: string; reactions: number | null; comments: number | null; reshares: number | null; impressions: number | null; postedAt: number | null }> {
  const out: any[] = [];
  const elements =
    postsResponse?.data?.feedDashProfileUpdatesByMemberShareFeed?.elements ||
    postsResponse?.data?.elements || [];
  for (const el of elements) {
    const text = el?.commentary?.text?.text || el?.commentary?.text || el?.content?.commentary?.text?.text || "";
    out.push({
      text: String(text).slice(0, 200),
      reactions: findNumber(el, ["numLikes", "totalSocialActivityCounts", "reactionsCount", "totalReactions", "numReactions"]),
      comments: findNumber(el, ["numComments", "commentsCount"]),
      reshares: findNumber(el, ["numShares", "reshareCount", "sharesCount"]),
      impressions: findNumber(el, ["impressionCount", "totalImpressions", "numImpressions"]),
      postedAt: findNumber(el, ["createdAt", "publishedAt", "originalPublishedAt", "lastEditAt"]),
    });
  }
  return out;
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

function Delta({ pct }: { pct: number | null }) {
  if (pct == null || !isFinite(pct)) return <span className="text-muted-foreground">—</span>;
  const positive = pct >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${positive ? "text-green-600" : "text-red-600"}`}>
      <Icon className="h-3 w-3" />{positive ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}

export default function LinkedInAnalytics() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
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

  const lastSync = snapshots[0]?.fetched_at;
  const staleHours = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 3_600_000 : Infinity;
  const isStale = staleHours > 24;

  const profile = useMemo(() => snapshots.find((s) => s.kind === "profile")?.data ?? null, [snapshots]);
  const companies = useMemo(() => snapshots.filter((s) => s.kind === "company").map((s) => s.data), [snapshots]);
  const posts = useMemo(() => (profile ? extractPostList(profile.posts) : []), [profile]);

  // ----- derived metrics -----
  const followers =
    findNumber(profile?.analytics, ["followerCount", "numFollowers", "followers"]) ??
    findNumber(profile?.following, ["followerCount", "numFollowers"]) ?? 0;
  const connections = findNumber(profile?.connections, ["totalResultCount", "total", "count", "numConnections"]) ?? 0;
  const impressionsYtd =
    findNumber(profile?.analytics, ["postImpressions", "impressions", "numImpressions"]) ??
    posts.reduce((s, p) => s + (p.impressions || 0), 0);
  const reactionsYtd = posts.reduce((s, p) => s + (p.reactions || 0), 0);
  const commentsYtd = posts.reduce((s, p) => s + (p.comments || 0), 0);
  const repostsYtd = posts.reduce((s, p) => s + (p.reshares || 0), 0);

  // posts/week — naive: posts in last 30 days / (30/7). Falls back to total posts / 4 when timestamps missing.
  const postsLast30d = posts.filter((p) => p.postedAt && Date.now() - p.postedAt < 30 * 24 * 60 * 60 * 1000).length;
  const postsPerWeek = postsLast30d > 0 ? +(postsLast30d / (30 / 7)).toFixed(1) : +(posts.length / 4).toFixed(1);

  // earned media value: impressions × CPM / 1000
  const earnedMediaValue = impressionsYtd > 0 ? (impressionsYtd * CPM_DEFAULT) / 1000 : 0;

  // followers history: from successive profile snapshots
  const followerHistory = useMemo(() => {
    const profileSnaps = snapshots
      .filter((s) => s.kind === "profile")
      .map((s) => ({
        date: new Date(s.fetched_at).toLocaleDateString(),
        followers: findNumber(s.data?.analytics, ["followerCount"]) ?? findNumber(s.data?.following, ["followerCount"]) ?? 0,
        impressions: findNumber(s.data?.analytics, ["postImpressions", "impressions"]) ?? 0,
      }))
      .reverse();
    return profileSnaps;
  }, [snapshots]);

  const engagementsByPost = useMemo(() =>
    posts.slice(0, 20).map((p, i) => ({
      i: i + 1,
      reactions: p.reactions || 0,
      comments: p.comments || 0,
      reshares: p.reshares || 0,
    })), [posts]);

  const topPosts = useMemo(() => [...posts].sort((a, b) => (b.impressions || b.reactions || 0) - (a.impressions || a.reactions || 0)).slice(0, 5), [posts]);
  const recentPosts = useMemo(() => [...posts].sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0)).slice(0, 5), [posts]);

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
          <a href="/integrations" className="text-primary underline text-sm">Go to Integrations →</a>
        </div>
      </PageLayout>
    );
  }

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
                Install it from <a href="/integrations" className="underline">Settings → Integrations</a> to enable one-click refresh from here.
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
              <div className="mt-1 text-[10px] text-muted-foreground uppercase tracking-wide">Average — 10/wk is power-user</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Earned media value <span className="text-xs font-normal text-muted-foreground">This year</span></CardTitle></CardHeader>
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

        {/* Middle row: Impressions trend + Followers trend */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Impressions</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2 tabular-nums">{fmt(impressionsYtd)}</div>
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
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Trend will appear after a few snapshots.</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Followers</CardTitle></CardHeader>
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
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Trend will appear after a few snapshots.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom row: Engagements per post + YTD compare */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">Engagements <span className="text-xs font-normal text-muted-foreground">Per post (last 20)</span></CardTitle></CardHeader>
            <CardContent>
              <div className="mb-2 text-xs flex gap-4">
                <span>🔁 {repostsYtd} reposts</span>
                <span>💬 {commentsYtd} comments</span>
                <span>❤️ {reactionsYtd} reactions</span>
              </div>
              <div className="h-40">
                {engagementsByPost.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={engagementsByPost}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="i" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
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

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">KPI summary</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-2">Metric</th>
                  <th className="text-right">Current</th>
                  <th className="text-right">Change</th>
                </tr></thead>
                <tbody className="divide-y">
                  <tr><td className="py-2">Posts</td><td className="text-right tabular-nums">{posts.length}</td><td className="text-right"><Delta pct={null} /></td></tr>
                  <tr><td className="py-2">Impressions</td><td className="text-right tabular-nums">{fmt(impressionsYtd)}</td><td className="text-right"><Delta pct={null} /></td></tr>
                  <tr><td className="py-2">Reactions</td><td className="text-right tabular-nums">{fmt(reactionsYtd)}</td><td className="text-right"><Delta pct={null} /></td></tr>
                  <tr><td className="py-2">Comments</td><td className="text-right tabular-nums">{fmt(commentsYtd)}</td><td className="text-right"><Delta pct={null} /></td></tr>
                  <tr><td className="py-2">Reposts</td><td className="text-right tabular-nums">{fmt(repostsYtd)}</td><td className="text-right"><Delta pct={null} /></td></tr>
                  <tr><td className="py-2">Followers</td><td className="text-right tabular-nums">{fmt(followers)}</td><td className="text-right"><Delta pct={null} /></td></tr>
                  <tr><td className="py-2">Connections</td><td className="text-right tabular-nums">{fmt(connections)}</td><td className="text-right"><Delta pct={null} /></td></tr>
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">% change fills in once a second snapshot from prior period exists.</p>
            </CardContent>
          </Card>
        </div>

        {/* Top + Recent posts */}
        {posts.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Top posts</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {topPosts.map((p, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-xs border-b pb-2 last:border-b-0">
                      <div className="flex-1 truncate">{p.text || "(no text)"}</div>
                      <div className="flex gap-2 text-muted-foreground tabular-nums whitespace-nowrap">
                        {p.impressions != null && <span>📊 {fmt(p.impressions)}</span>}
                        <span>❤️ {p.reactions ?? 0}</span>
                        <span>💬 {p.comments ?? 0}</span>
                        <span>🔁 {p.reshares ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent posts</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentPosts.map((p, i) => (
                    <div key={i} className="flex items-start justify-between gap-3 text-xs border-b pb-2 last:border-b-0">
                      <div className="flex-1 truncate">{p.text || "(no text)"}</div>
                      <div className="flex gap-2 text-muted-foreground tabular-nums whitespace-nowrap">
                        <span>❤️ {p.reactions ?? 0}</span>
                        <span>💬 {p.comments ?? 0}</span>
                        <span>🔁 {p.reshares ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Companies */}
        {companies.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Company pages</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {companies.map((c: any) => {
                  const f = findNumber(c.followerStats, ["organicFollowerCount", "totalFollowerCount"]) ?? c.followerCount;
                  const pv = findNumber(c.pageStats, ["totalPageViews", "allPageViews"]);
                  const imp = findNumber(c.shareStats, ["impressionCount", "totalImpressions"]);
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 text-xs border-b pb-2 last:border-b-0">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.logoUrl && <img src={c.logoUrl} className="h-6 w-6 rounded" />}
                        <span className="font-medium truncate">{c.name}</span>
                      </div>
                      <div className="flex gap-3 text-muted-foreground tabular-nums whitespace-nowrap">
                        <span>👥 {fmt(f)}</span>
                        {pv != null && <span>👁 {fmt(pv)}</span>}
                        {imp != null && <span>📊 {fmt(imp)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
