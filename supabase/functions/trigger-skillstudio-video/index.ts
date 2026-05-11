// Bridge: triggers Skill Studio AI's generate-avatar-video endpoint on
// behalf of the authenticated ContentLab user and returns the course_videos
// row id so the client can poll for completion.
//
// Required ContentLab Supabase secret:
//   COMPLIANCE_API_KEY  — shared x-api-key with lms-backend.
//
// Optional:
//   SKILLSTUDIO_API_BASE — defaults to lms-backend's production URL.
//   SKILLSTUDIO_TARGET_USER_ID — lms-backend user id billed for the
//     render. If unset, lms-backend uses its own COMPLIANCE_TARGET_USER_ID
//     default.

import { requireAuth } from "../_shared/auth.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const API_BASE = Deno.env.get("SKILLSTUDIO_API_BASE") || "https://oxlujbymtjugefaqmwuy.supabase.co";
// Match the secret name lms-backend uses so the user only manages one value.
const API_KEY = Deno.env.get("COMPLIANCE_API_KEY") || Deno.env.get("SKILLSTUDIO_API_KEY") || "";
const TARGET_USER_ID = Deno.env.get("SKILLSTUDIO_TARGET_USER_ID") || "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try { await requireAuth(req); } catch (r) { return r as Response; }

  if (!API_KEY) {
    return json({
      error: "Skill Studio AI integration is not configured",
      detail: "Set COMPLIANCE_API_KEY in ContentLab Supabase function secrets.",
    }, 503);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const topic = String(body?.topic || "").trim();
  const heygenTemplateId = String(body?.heygenTemplateId || "").trim();
  if (!topic) return json({ error: "`topic` is required (becomes the video's spoken script seed)" }, 400);
  if (!heygenTemplateId) return json({ error: "`heygenTemplateId` is required — pick one from Skill Studio AI's HeyGen templates" }, 400);

  // We give the upstream a fresh courseId per request so different posts
  // don't trample each other in course_videos. Skill Studio's avatar-video
  // flow accepts any UUID here.
  const courseId = crypto.randomUUID();

  // userId is required upstream when x-api-key is used UNLESS lms-backend
  // has its own COMPLIANCE_TARGET_USER_ID set as a default. We pass it only
  // if explicitly configured on our side, else let lms-backend fall back.
  const payload: Record<string, any> = {
    courseId,
    enableAvatarIntro: true,
    enableCinematicBroll: false,
    heygenTemplateId,
    wizardData: {
      courseTitle: topic.slice(0, 100),
      topic,
      audienceLevel: body?.audienceLevel || "professional",
      audienceCategory: body?.audienceCategory || "general",
      tone: body?.tone || "professional",
      objectives: Array.isArray(body?.objectives) ? body.objectives : [],
    },
  };
  if (TARGET_USER_ID) payload.userId = TARGET_USER_ID;

  const res = await fetch(`${API_BASE}/functions/v1/generate-avatar-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json({ error: data?.error || `Skill Studio returned HTTP ${res.status}`, detail: data }, res.status);
  }

  // Skill Studio returns the course_videos row. The final MP4 / Mux URL
  // lands later when their poll-video-status cron sees HeyGen finish.
  return json({
    success: true,
    courseId,
    course_video: data?.course_video || data,
    note: "Generation runs async via HeyGen. Poll /functions/v1/poll-skillstudio-video?courseId=... or wait ~2-5 min, then refresh the post.",
  });
});
