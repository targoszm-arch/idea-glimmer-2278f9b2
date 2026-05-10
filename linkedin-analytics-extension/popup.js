"use strict";

const $ = (id) => document.getElementById(id);

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function setStatus(text, isError = false) {
  const el = $("status");
  el.textContent = text || "";
  el.classList.toggle("error", !!isError);
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString();
}

function findNumber(obj, keys, depth = 0) {
  if (!obj || depth > 6 || typeof obj !== "object") return null;
  for (const k of keys) {
    if (typeof obj[k] === "number") return obj[k];
    if (typeof obj[k] === "string" && /^\d+$/.test(obj[k]))
      return parseInt(obj[k], 10);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const found = findNumber(v, keys, depth + 1);
      if (found != null) return found;
    }
  }
  return null;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function statCard(label, value) {
  return `<div class="stat">
    <div class="num">${value == null ? "—" : value.toLocaleString()}</div>
    <div class="label">${escapeHtml(label)}</div>
  </div>`;
}

// ---- Personal rendering ---------------------------------------------------

function extractPostList(postsResponse) {
  const out = [];
  const elements =
    postsResponse?.data?.feedDashProfileUpdatesByMemberShareFeed?.elements ||
    postsResponse?.data?.elements ||
    postsResponse?.elements ||
    [];
  for (const el of elements) {
    const text =
      el?.commentary?.text?.text ||
      el?.commentary?.text ||
      el?.content?.commentary?.text?.text ||
      el?.value?.commentary?.text?.text ||
      "";
    out.push({
      text: String(text).slice(0, 600),
      reactions: findNumber(el, [
        "numLikes", "totalReactions", "reactionsCount", "numReactions",
      ]),
      comments: findNumber(el, ["numComments", "commentsCount"]),
      reshares: findNumber(el, ["numShares", "reshareCount", "sharesCount"]),
    });
    if (out.length >= 25) break;
  }
  return out;
}

function renderPersonal(snapshot) {
  if (!snapshot) return;
  const { profile, analytics, connections, following, posts, fetchedAt } =
    snapshot;

  if (profile) {
    $("profile").classList.remove("hidden");
    $("profile").innerHTML = `
      <div class="profile-row">
        <img src="${profile.profilePictureUrl || ""}" onerror="this.style.visibility='hidden'"/>
        <div>
          <div class="name">${escapeHtml(profile.firstName || "")} ${escapeHtml(profile.lastName || "")}</div>
          <div class="headline">${escapeHtml(profile.headline || "")}</div>
          <div class="headline">${escapeHtml(profile.location || "")}</div>
        </div>
      </div>`;
  }

  const followers =
    findNumber(analytics, ["followerCount", "numFollowers"]) ??
    findNumber(following, ["followerCount", "numFollowers"]);
  const connectionCount = findNumber(connections, [
    "totalResultCount", "total", "count", "numConnections",
  ]);
  const postImpressions = findNumber(analytics, [
    "postImpressions", "impressions", "numImpressions",
  ]);
  const profileViews = findNumber(analytics, [
    "numProfileViews", "profileViews",
  ]);

  $("stats").innerHTML = [
    statCard("Followers", followers),
    statCard("Connections", connectionCount),
    statCard("Post impressions (90d)", postImpressions),
    statCard("Profile views", profileViews),
  ].join("");
  $("stats").classList.remove("hidden");

  const list = extractPostList(posts);
  $("posts").classList.remove("hidden");
  $("post-list").innerHTML = list.length
    ? list
        .map(
          (p) => `<div class="post">
            <div class="text">${escapeHtml(p.text)}</div>
            <div class="meta">
              ${p.reactions != null ? `👍 ${p.reactions}` : ""}
              ${p.comments != null ? ` 💬 ${p.comments}` : ""}
              ${p.reshares != null ? ` 🔁 ${p.reshares}` : ""}
            </div>
          </div>`
        )
        .join("")
    : "<em>No recent posts.</em>";

  setStatus("Last updated: " + fmtDate(fetchedAt));
}

// ---- Company rendering ----------------------------------------------------

function extractCompanyPosts(updates) {
  const out = [];
  const elements = updates?.elements || updates?.data?.elements || [];
  for (const el of elements) {
    const value = el?.value || el;
    const text =
      value?.commentary?.text?.text ||
      value?.commentary?.text ||
      value?.content?.commentary?.text ||
      "";
    out.push({
      text: String(text).slice(0, 600),
      reactions: findNumber(el, [
        "numLikes", "totalReactions", "reactionsCount",
      ]),
      comments: findNumber(el, ["numComments"]),
      reshares: findNumber(el, ["numShares", "reshareCount"]),
    });
    if (out.length >= 25) break;
  }
  return out;
}

function renderCompany(snapshot) {
  if (!snapshot) return;
  const { company, followers, posts, postsError, followersError, fetchedAt } =
    snapshot;

  if (company) {
    $("profile").classList.remove("hidden");
    $("profile").innerHTML = `
      <div class="profile-row">
        <img src="${company.logoUrl || ""}" onerror="this.style.visibility='hidden'"/>
        <div>
          <div class="name">${escapeHtml(company.name || "")}</div>
          <div class="headline">${escapeHtml(company.tagline || company.industry || "")}</div>
          <div class="headline">${escapeHtml(company.headquarter || "")}</div>
        </div>
      </div>`;
  }

  const followerCount =
    company?.followerCount ?? findNumber(followers, ["followerCount"]);
  const newFollowers = findNumber(followers, [
    "newFollowers", "newFollowerCount",
  ]);
  const pageViews = findNumber(followers, [
    "pageViews", "totalPageViews", "numPageViews",
  ]);

  $("stats").innerHTML = [
    statCard("Followers", followerCount),
    statCard("Employees", company?.staffCount),
    statCard("New followers", newFollowers),
    statCard("Page views (admin)", pageViews),
  ].join("");
  $("stats").classList.remove("hidden");

  const list = extractCompanyPosts(posts);
  $("posts").classList.remove("hidden");
  $("post-list").innerHTML = list.length
    ? list
        .map(
          (p) => `<div class="post">
            <div class="text">${escapeHtml(p.text)}</div>
            <div class="meta">
              ${p.reactions != null ? `👍 ${p.reactions}` : ""}
              ${p.comments != null ? ` 💬 ${p.comments}` : ""}
              ${p.reshares != null ? ` 🔁 ${p.reshares}` : ""}
            </div>
          </div>`
        )
        .join("")
    : "<em>No recent posts.</em>";

  let note = "Last updated: " + fmtDate(fetchedAt);
  if (followersError) note += " · follower stats blocked (admin-only)";
  if (postsError) note += " · posts error: " + postsError;
  setStatus(note);
}

// ---- Mode plumbing --------------------------------------------------------

function currentMode() {
  return document.querySelector('input[name="mode"]:checked').value;
}

function parseUniversalName(input) {
  // Accepts a slug or a full URL like https://www.linkedin.com/company/foo/
  const m = String(input || "")
    .trim()
    .match(/(?:linkedin\.com\/company\/)?([^\/?#]+)\/?/i);
  return m ? m[1] : "";
}

async function refresh() {
  $("refresh").disabled = true;
  const mode = currentMode();
  try {
    if (mode === "personal") {
      setStatus("Fetching your personal LinkedIn data…");
      const resp = await send({ type: "fetchAll", postCount: 50 });
      if (!resp?.success)
        return setStatus("Error: " + (resp?.error || "unknown"), true);
      renderPersonal(resp.data);
    } else {
      const universalName = parseUniversalName($("universalName").value);
      if (!universalName)
        return setStatus(
          'Enter a company slug (e.g. "microsoft" or the full URL)',
          true
        );
      setStatus("Fetching company data for " + universalName + "…");
      const resp = await send({
        type: "fetchCompany",
        universalName,
        postCount: 25,
      });
      if (!resp?.success)
        return setStatus("Error: " + (resp?.error || "unknown"), true);
      renderCompany(resp.data);
    }
  } finally {
    $("refresh").disabled = false;
  }
}

async function clear() {
  await send({ type: "clear" });
  $("profile").classList.add("hidden");
  $("stats").classList.add("hidden");
  $("posts").classList.add("hidden");
  setStatus("Cleared.");
}

function applyModeUI() {
  const mode = currentMode();
  $("universalName").classList.toggle("hidden", mode !== "company");
}

(async () => {
  $("refresh").addEventListener("click", refresh);
  $("clear").addEventListener("click", clear);
  document
    .querySelectorAll('input[name="mode"]')
    .forEach((r) => r.addEventListener("change", () => {
      applyModeUI();
      loadCached();
    }));
  $("universalName").addEventListener("change", loadCached);
  applyModeUI();
  await loadCached();
})();

async function loadCached() {
  const cached = await send({ type: "getSnapshot" });
  $("profile").classList.add("hidden");
  $("stats").classList.add("hidden");
  $("posts").classList.add("hidden");
  if (!cached?.success) {
    setStatus('Click "Refresh" to fetch.');
    return;
  }
  if (currentMode() === "personal") {
    if (cached.data.personal) renderPersonal(cached.data.personal);
    else setStatus('Click "Refresh" to fetch your personal analytics.');
  } else {
    const slug = parseUniversalName($("universalName").value);
    const snap = slug ? cached.data.companies?.[slug] : null;
    if (snap) renderCompany(snap);
    else setStatus("Enter a company slug and click Refresh.");
  }
}
