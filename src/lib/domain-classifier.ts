// Heuristic classifier — maps a hostname to one of Peec's source-type buckets.
//
// You         — the user's own domain or subdomains thereof
// Competitor  — explicitly tracked competitor brand names → domain
// UGC         — user-generated-content platforms
// Reference   — encyclopedias, official docs, government, .edu
// Editorial   — news / industry publications
// Corporate   — vendor / corporate sites that aren't your tracked competitors
// Institutional — .gov, .org of standards bodies, official statistics
// Other       — everything else

export type DomainType =
  | "you"
  | "competitor"
  | "ugc"
  | "reference"
  | "editorial"
  | "corporate"
  | "institutional"
  | "other";

const UGC_DOMAINS = new Set([
  "reddit.com",
  "quora.com",
  "stackexchange.com",
  "stackoverflow.com",
  "ycombinator.com",
  "news.ycombinator.com",
  "producthunt.com",
  "tiktok.com",
  "youtube.com",
  "instagram.com",
  "facebook.com",
  "linkedin.com",
  "twitter.com",
  "x.com",
  "medium.com",
  "dev.to",
  "github.com",
  "gitlab.com",
  "discord.com",
  "slack.com",
]);

const REFERENCE_DOMAINS = new Set([
  "wikipedia.org",
  "wiktionary.org",
  "wikidata.org",
  "britannica.com",
]);

const EDITORIAL_HINTS = [
  "techcrunch.com", "theverge.com", "wired.com", "arstechnica.com",
  "nytimes.com", "wsj.com", "ft.com", "bbc.com", "bbc.co.uk", "reuters.com",
  "bloomberg.com", "cnbc.com", "forbes.com", "businessinsider.com",
  "venturebeat.com", "engadget.com", "theatlantic.com", "economist.com",
  "axios.com", "fastcompany.com", "inc.com", "hbr.org", "mit.edu",
  "elearningindustry.com", "edsurge.com", "trainingindustry.com",
];

function topHostname(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return url.toLowerCase(); }
}

function rootDomain(host: string): string {
  // crude root: last 2 dotted segments (loses .co.uk-style TLDs but acceptable
  // for classification heuristics).
  const parts = host.split(".");
  return parts.slice(-2).join(".");
}

function competitorDomains(competitors: string[]): Set<string> {
  // Best-effort: lowercased name → common domain forms (name.com, name.io, name.ai).
  const out = new Set<string>();
  for (const c of competitors) {
    const slug = c.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
    if (!slug) continue;
    for (const tld of ["com", "io", "ai", "co", "net"]) out.add(`${slug}.${tld}`);
  }
  return out;
}

export function classifyDomain(
  url: string,
  ownBrandUrl: string,
  competitors: string[],
): DomainType {
  const host = topHostname(url);
  const root = rootDomain(host);
  const ownRoot = ownBrandUrl ? rootDomain(topHostname(ownBrandUrl)) : "";

  if (ownRoot && (host === ownRoot || host.endsWith("." + ownRoot) || root === ownRoot)) return "you";

  const compSet = competitorDomains(competitors);
  if (compSet.has(host) || compSet.has(root)) return "competitor";

  if (UGC_DOMAINS.has(host) || UGC_DOMAINS.has(root)) return "ugc";
  if (REFERENCE_DOMAINS.has(host) || REFERENCE_DOMAINS.has(root)) return "reference";
  if (host.endsWith(".edu")) return "reference";
  if (host.endsWith(".gov") || host.endsWith(".gov.uk") || host.endsWith(".gov.ie")) return "institutional";

  for (const ed of EDITORIAL_HINTS) {
    if (host === ed || host.endsWith("." + ed)) return "editorial";
  }

  // Org domains that aren't institutional (standards bodies) → corporate
  if (host.endsWith(".org")) {
    if (host.includes("standards") || host.includes("iso") || host.includes("ietf")) return "institutional";
    return "other";
  }

  // Everything else with a normal commercial TLD → corporate-ish
  if (host.endsWith(".com") || host.endsWith(".io") || host.endsWith(".ai") || host.endsWith(".co") || host.endsWith(".app")) {
    return "corporate";
  }

  return "other";
}

export function domainTypeColor(t: DomainType): string {
  switch (t) {
    case "you": return "border-green-300 bg-green-50 text-green-700";
    case "competitor": return "border-red-300 bg-red-50 text-red-700";
    case "ugc": return "border-cyan-300 bg-cyan-50 text-cyan-700";
    case "reference": return "border-purple-300 bg-purple-50 text-purple-700";
    case "editorial": return "border-blue-300 bg-blue-50 text-blue-700";
    case "corporate": return "border-orange-300 bg-orange-50 text-orange-700";
    case "institutional": return "border-emerald-300 bg-emerald-50 text-emerald-700";
    default: return "border-muted text-muted-foreground";
  }
}
