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
  const d = new Date(ts);
  return d.toLocaleString();
}

// Walks an arbitrary object looking for a numeric field by candidate keys.
function findNumber(obj, keys, depth = 0) {
  if (!obj || depth > 6) return null;
  if (typeof obj !== "object") return null;
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

function extractPostList(postsResponse) {
  // Voyager profile updates response has elements with commentary text.
  const out = [];
  const elements =
    postsResponse?.data?.feedDashProfileUpdatesByMemberShareFeed?.elements ||
    postsResponse?.data?.elements ||
    [];
  for (const el of elements) {
    const text =
      el?.commentary?.text?.text ||
      el?.commentary?.text ||
      el?.content?.commentary?.text?.text ||
      "";
    const social = el?.socialDetail || el?.social || {};
    const reactions =
      findNumber(el, [
        "numLikes",
        "totalSocialActivityCounts",
        "reactionsCount",
        "totalReactions",
        "numReactions",
      ]) ?? null;
    const comments = findNumber(el, ["numComments", "commentsCount"]) ?? null;
    const reshares =
      findNumber(el, ["numShares", "reshareCount", "sharesCount"]) ?? null;
    out.push({
      text: String(text).slice(0, 600),
      reactions,
      comments,
      reshares,
    });
    if (out.length >= 25) break;
  }
  return out;
}

function render(snapshot) {
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
    findNumber(analytics, ["followerCount", "numFollowers", "followers"]) ??
    findNumber(following, ["followerCount", "numFollowers"]);
  const connectionCount =
    findNumber(connections, [
      "totalResultCount",
      "total",
      "count",
      "numConnections",
    ]);
  const postImpressions = findNumber(analytics, [
    "postImpressions",
    "impressions",
    "numImpressions",
  ]);
  const profileViews = findNumber(analytics, [
    "numProfileViews",
    "profileViews",
  ]);

  const statsHtml = [
    statCard("Followers", followers),
    statCard("Connections", connectionCount),
    statCard("Post impressions (90d)", postImpressions),
    statCard("Profile views", profileViews),
  ].join("");
  $("stats").innerHTML = statsHtml;
  $("stats").classList.remove("hidden");

  const list = extractPostList(posts);
  if (list.length) {
    $("posts").classList.remove("hidden");
    $("post-list").innerHTML = list
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
      .join("");
  }

  setStatus("Last updated: " + fmtDate(fetchedAt));
}

function statCard(label, value) {
  return `<div class="stat">
    <div class="num">${value == null ? "—" : value.toLocaleString()}</div>
    <div class="label">${escapeHtml(label)}</div>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

async function refresh() {
  $("refresh").disabled = true;
  setStatus("Fetching from LinkedIn… (open a LinkedIn tab if this stalls)");
  const resp = await send({ type: "fetchAll", postCount: 50 });
  $("refresh").disabled = false;
  if (!resp?.success) {
    setStatus("Error: " + (resp?.error || "unknown"), true);
    return;
  }
  render(resp.data);
}

async function clear() {
  await send({ type: "clear" });
  $("profile").classList.add("hidden");
  $("stats").classList.add("hidden");
  $("posts").classList.add("hidden");
  setStatus("Cleared.");
}

(async () => {
  $("refresh").addEventListener("click", refresh);
  $("clear").addEventListener("click", clear);
  const cached = await send({ type: "getSnapshot" });
  if (cached?.success && cached.data) {
    render(cached.data);
  } else {
    setStatus('Click "Refresh" to fetch your LinkedIn analytics.');
  }
})();
