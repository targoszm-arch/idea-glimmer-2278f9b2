// Content script: runs on linkedin.com, exposes LinkedIn Voyager API access
// to the extension via chrome.runtime messages. All data stays local.
(() => {
  "use strict";

  const API_URL = "https://www.linkedin.com/voyager/api";
  const GRAPHQL_URL = "https://www.linkedin.com/voyager/api/graphql";

  // GraphQL query IDs reverse-engineered from LinkedIn's web client.
  // These can rotate over time — update if requests start 4xx-ing.
  const QUERY_ID_ME =
    "voyagerIdentityDashProfiles.34ead06db82a2cc9a778fac97f69ad6a";
  const QUERY_ID_ANALYTICS =
    "voyagerFeedDashCreatorExperienceDashboard.6fcd24af6f10cdcd1cd7d8e747df3276";
  const QUERY_ID_FOLLOWING =
    "voyagerSearchDashClusters.15c671c3162c043443995439a3d3b6dd";
  const QUERY_ID_POSTS =
    "voyagerFeedDashProfileUpdates.80d5abb3cd25edff72c093a5db696079";

  // Company / organization endpoints. Voyager endpoints below are REST
  // (decorated) — they're stable across query-id rotations.
  const ORG_LOOKUP_URL = (universalName) =>
    `${API_URL}/organization/companies?decorationId=com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12&q=universalName&universalName=${encodeURIComponent(universalName)}`;
  const ORG_BY_ID_URL = (orgId) =>
    `${API_URL}/organization/companies/${encodeURIComponent(orgId)}?decorationId=com.linkedin.voyager.deco.organization.web.WebFullCompanyMain-12`;
  const ORG_FOLLOWERS_URL = (orgUrn) =>
    `${API_URL}/organization/organizationPageStatistics?q=organization&organization=${encodeURIComponent(orgUrn)}`;
  const ORG_UPDATES_URL = (orgUrn, count = 25) =>
    `${API_URL}/feed/updatesV2?q=companyFeedByUniversalName&moduleKey=member-share&count=${count}&start=0&companyUniversalName=${encodeURIComponent(orgUrn)}`;
  // Admin-only analytics; will 403 if the user doesn't admin the page.
  const ORG_ADMIN_ANALYTICS_URL = (orgUrn) =>
    `${API_URL}/organization/organizationPageStatistics?q=organization&organization=${encodeURIComponent(orgUrn)}`;

  function getCookie(name) {
    const m = document.cookie
      .split("; ")
      .find((c) => c.startsWith(name + "="));
    return m ? m.split("=").slice(1).join("=") : null;
  }

  function getCsrfToken() {
    const j = getCookie("JSESSIONID");
    return j ? j.replace(/['"]+/g, "") : null;
  }

  async function voyagerGet(url) {
    const csrf = getCsrfToken();
    const headers = { "Content-Type": "application/json" };
    if (csrf) headers["Csrf-Token"] = csrf;
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers,
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  async function getMe(vanity = "me") {
    const url = `${GRAPHQL_URL}?variables=(vanityName:${encodeURIComponent(
      vanity
    )})&queryId=${QUERY_ID_ME}`;
    return voyagerGet(url);
  }

  async function getAnalytics() {
    const url = `${GRAPHQL_URL}?includeWebMetadata=false&queryId=${QUERY_ID_ANALYTICS}`;
    return voyagerGet(url);
  }

  async function getConnections() {
    const url = `${API_URL}/search/dash/clusters?decorationId=com.linkedin.voyager.dash.deco.search.SearchClusterCollection-1&count=0&origin=Communities&q=all&query=(queryParameters:(resultType:List(CONNECTIONS)),flagshipSearchIntent:MYNETWORK_CURATION_HUB)&start=0`;
    return voyagerGet(url);
  }

  async function getFollowing() {
    const url = `${GRAPHQL_URL}?includeWebMetadata=false&variables=(start:0,count:10,origin:CurationHub,query:(flagshipSearchIntent:MYNETWORK_CURATION_HUB,includeFiltersInResponse:true,queryParameters:List((key:resultType,value:List(PEOPLE_FOLLOW)))))&queryId=${QUERY_ID_FOLLOWING}`;
    return voyagerGet(url);
  }

  async function getPosts(publicId, count = 50) {
    const variables = `(count:${count},start:0,profileUrn:${encodeURIComponent(
      "urn:li:fsd_profile:" + publicId
    )})`;
    const url = `${GRAPHQL_URL}?includeWebMetadata=false&variables=${variables}&queryId=${QUERY_ID_POSTS}`;
    return voyagerGet(url);
  }

  function extractProfile(meResponse) {
    const el =
      meResponse?.data?.identityDashProfilesByMemberIdentity?.elements?.[0];
    if (!el) return null;
    const publicId = (el.entityUrn || "").split(":").pop();
    const vec =
      el.profilePicture?.displayImageReferenceResolutionResult?.vectorImage;
    const root = vec?.rootUrl || "";
    const arts = vec?.artifacts || [];
    const art =
      arts.find((a) => a.width >= 100 && a.height >= 100) || arts[0];
    const pic = art && root ? root + art.fileIdentifyingUrlPathSegment : "";
    return {
      kind: "person",
      firstName: el.firstName,
      lastName: el.lastName,
      headline: el.headline,
      publicIdentifier: el.publicIdentifier,
      publicId,
      location: el.geoLocation?.geo?.defaultLocalizedName || "",
      profilePictureUrl: pic,
    };
  }

  // ---- Company helpers ----------------------------------------------------

  async function getCompanyByUniversalName(universalName) {
    const data = await voyagerGet(ORG_LOOKUP_URL(universalName));
    const el = data?.elements?.[0];
    if (!el) throw new Error("Company not found: " + universalName);
    return el;
  }

  async function getCompanyFollowers(orgUrn) {
    return voyagerGet(ORG_FOLLOWERS_URL(orgUrn));
  }

  async function getCompanyUpdates(universalName, count = 25) {
    return voyagerGet(ORG_UPDATES_URL(universalName, count));
  }

  function extractCompany(el) {
    if (!el) return null;
    const logoVec =
      el.logo?.image?.["com.linkedin.common.VectorImage"] ||
      el.logoResolutionResult?.vectorImage;
    const root = logoVec?.rootUrl || "";
    const arts = logoVec?.artifacts || [];
    const art = arts.find((a) => a.width >= 100) || arts[0];
    const logo = art && root ? root + art.fileIdentifyingUrlPathSegment : "";
    return {
      kind: "company",
      name: el.name,
      universalName: el.universalName,
      entityUrn: el.entityUrn,
      industry: el.companyIndustries?.[0]?.localizedName || el.industry || "",
      headquarter:
        [el.headquarter?.city, el.headquarter?.country]
          .filter(Boolean)
          .join(", ") || "",
      followerCount: el.followingInfo?.followerCount ?? null,
      staffCount: el.staffCount ?? null,
      tagline: el.tagline || "",
      logoUrl: logo,
      websiteUrl: el.companyPageUrl || el.websiteUrl || "",
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      try {
        switch (msg?.type) {
          case "ping":
            sendResponse({ success: true });
            return;
          case "getProfile": {
            const me = await getMe(msg.vanity || "me");
            const profile = extractProfile(me);
            if (!profile)
              return sendResponse({ success: false, error: "No profile" });
            sendResponse({ success: true, data: { profile, raw: me } });
            return;
          }
          case "getAll": {
            const me = await getMe();
            const profile = extractProfile(me);
            if (!profile)
              return sendResponse({ success: false, error: "No profile" });
            const [analytics, connections, following, posts] =
              await Promise.allSettled([
                getAnalytics(),
                getConnections(),
                getFollowing(),
                getPosts(profile.publicId, msg.postCount || 50),
              ]);
            sendResponse({
              success: true,
              data: {
                profile,
                analytics:
                  analytics.status === "fulfilled" ? analytics.value : null,
                connections:
                  connections.status === "fulfilled"
                    ? connections.value
                    : null,
                following:
                  following.status === "fulfilled" ? following.value : null,
                posts: posts.status === "fulfilled" ? posts.value : null,
                fetchedAt: Date.now(),
              },
            });
            return;
          }
          case "getCompany": {
            const universalName = msg.universalName;
            if (!universalName)
              return sendResponse({
                success: false,
                error: "universalName required (the slug from the company URL)",
              });
            const raw = await getCompanyByUniversalName(universalName);
            const company = extractCompany(raw);
            const orgUrn = company?.entityUrn;
            const [followers, updates] = await Promise.allSettled([
              orgUrn ? getCompanyFollowers(orgUrn) : Promise.resolve(null),
              getCompanyUpdates(universalName, msg.postCount || 25),
            ]);
            sendResponse({
              success: true,
              data: {
                company,
                rawCompany: raw,
                followers:
                  followers.status === "fulfilled" ? followers.value : null,
                followersError:
                  followers.status === "rejected"
                    ? String(followers.reason?.message || followers.reason)
                    : null,
                posts: updates.status === "fulfilled" ? updates.value : null,
                postsError:
                  updates.status === "rejected"
                    ? String(updates.reason?.message || updates.reason)
                    : null,
                fetchedAt: Date.now(),
              },
            });
            return;
          }
          case "getPosts": {
            const me = await getMe();
            const profile = extractProfile(me);
            const posts = await getPosts(
              profile.publicId,
              msg.postCount || 50
            );
            sendResponse({ success: true, data: { profile, posts } });
            return;
          }
          default:
            sendResponse({ success: false, error: "Unknown message type" });
        }
      } catch (e) {
        sendResponse({ success: false, error: String(e?.message || e) });
      }
    })();
    return true; // async
  });

  console.log("[LI Personal Analytics] content script ready");
})();
