import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const adminSupabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  try {
    // Parse body — supports heartbeat tick ({time}) or specific run ({automation_id})
    let body: any = {};
    try { body = await req.json(); } catch {}
    const specificId = body.automation_id ?? null;

    console.log("run-automations triggered at", new Date().toISOString(), "specificId:", specificId);

    let query = adminSupabase.from("automations").select("*");

    if (specificId) {
      // Run Now: run a specific automation regardless of next_run_at
      query = query.eq("id", specificId);
    } else {
      // Heartbeat: run all due active automations
      query = query.eq("is_active", true).lte("next_run_at", new Date().toISOString());
    }

    const { data: automations, error } = await query;
    if (error) {
      console.error("Query error:", error);
      throw error;
    }
    console.log(`Found ${automations?.length ?? 0} automations to run`);
    if (!automations?.length) {
      return new Response(JSON.stringify({ ran: 0, message: "No automations due" }), {
        headers: { ...cors, "Content-Type": "application/json" }
      });
    }

    const results = [];

    for (const automation of automations) {
      let articleId: string | null = null;
      let errorMessage: string | null = null;
      let resolvedPrompt: string | null = null;

      try {
        // Determine topic/prompt
        let topic = "";
        let tone = automation.tone || "informative";
        let category = automation.category || "";

        if (automation.generate_mode === "ideas_queue") {
          // Fetch next unused idea
          let query = adminSupabase
            .from("content_ideas")
            .select("*")
            .eq("user_id", automation.user_id)
            .eq("status", "unused")
            .limit(1);

          if (automation.funnel_stage_filter && automation.funnel_stage_filter !== "all") {
            query = query.eq("strategy", automation.funnel_stage_filter);
          }
          const { data: ideas } = await query.single();
          if (!ideas) throw new Error("No unused ideas available matching the filter");

          topic = ideas.title_suggestion || ideas.topic;
          if (ideas.category) category = ideas.category;

          // Mark idea as used
          await adminSupabase.from("content_ideas").update({ status: "used" }).eq("id", ideas.id);

        } else if (automation.generate_mode === "custom_prompt") {
          // Resolve variable placeholders
          let prompt = automation.custom_prompt || "";
          const vars = automation.prompt_variables as Record<string, string[]> || {};

          // Rotate variables — pick next in list based on run count
          const { count } = await adminSupabase
            .from("automation_runs")
            .select("*", { count: "exact", head: true })
            .eq("automation_id", automation.id);

          const runCount = count ?? 0;
          for (const [key, values] of Object.entries(vars)) {
            if (Array.isArray(values) && values.length > 0) {
              prompt = prompt.replace(new RegExp(`\\{${key}\\}`, "g"), values[runCount % values.length]);
            }
          }
          // Replace {date}
          prompt = prompt.replace(/\{date\}/g, new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }));
          topic = prompt;
          resolvedPrompt = prompt;
        }

        // Get user's AI settings
        const { data: aiSettings } = await adminSupabase
          .from("ai_settings")
          .select("*")
          .eq("user_id", automation.user_id)
          .single();

        // Generate article using the existing edge function
        const lengthMap: Record<string, string> = { short: "~500 words", medium: "~1000 words", long: "~2000 words" };
        const lengthHint = lengthMap[automation.article_length || "medium"] || "~1000 words";

        // Call generate-article with service role key + user_id_override
        const generateResp = await fetch(`${supabaseUrl}/functions/v1/generate-article`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            topic: `${topic} (${lengthHint})`,
            tone: aiSettings?.tone_label || tone,
            tone_description: aiSettings?.tone_description || "",
            category,
            app_description: aiSettings?.app_description || "",
            app_audience: aiSettings?.app_audience || "",
            reference_urls: aiSettings?.reference_urls || [],
            user_id_override: automation.user_id, // used by function to deduct credits
          }),
        });

        if (!generateResp.ok) {
          const errText = await generateResp.text();
          throw new Error(`Article generation failed: ${generateResp.status} - ${errText.slice(0, 200)}`);
        }

        // Read full SSE stream with a buffer to handle split chunks
        const reader = generateResp.body!.getReader();
        const decoder = new TextDecoder();
        let content = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Process complete lines from buffer
          const lines = buffer.split("\n");
          // Keep last incomplete line in buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) content += delta;
            } catch { /* skip malformed lines */ }
          }
        }

        // Process any remaining buffer content
        if (buffer.trim().startsWith("data: ")) {
          const data = buffer.trim().slice(6);
          if (data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) content += delta;
            } catch {}
          }
        }

        console.log(`Generated content length: ${content.length} chars`);
        if (!content || content.length < 100) throw new Error("Generated content too short or empty");

        // Extract title and meta from content
        const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "") : topic.slice(0, 80);
        const metaTitleMatch = content.match(/<!--\s*META_TITLE:\s*(.+?)\s*-->/i);
        const metaDescMatch = content.match(/<!--\s*META_DESCRIPTION:\s*(.+?)\s*-->/i);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 64).replace(/-+$/, "");

        // Optionally improve SEO
        let finalContent = content;
        if (automation.improve_seo) {
          try {
            const seoResp = await fetch(`${supabaseUrl}/functions/v1/improve-article`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                content,
                instruction: "Improve the SEO of this article. Optimize headings, meta description, keyword density, and internal structure. Keep all content intact.",
              }),
            });
            if (seoResp.ok) {
              const seoReader = seoResp.body!.getReader();
              let seoContent = "";
              while (true) {
                const { done, value } = await seoReader.read();
                if (done) break;
                const chunk = new TextDecoder().decode(value);
                for (const line of chunk.split("\n")) {
                  if (line.startsWith("data: ")) {
                    const data = line.slice(6);
                    if (data === "[DONE]") continue;
                    try { seoContent += JSON.parse(data).choices?.[0]?.delta?.content || ""; } catch {}
                  }
                }
              }
              if (seoContent) finalContent = seoContent;
            }
          } catch (seoErr) {
            console.error("SEO improvement failed:", seoErr);
            // Continue with original content
          }
        }

        // Save article
        const { data: article, error: articleError } = await adminSupabase
          .from("articles")
          .insert({
            user_id: automation.user_id,
            title,
            slug,
            content: finalContent,
            excerpt: finalContent.replace(/<[^>]+>/g, "").slice(0, 200),
            meta_description: metaDescMatch?.[1]?.slice(0, 255) || "",
            category,
            status: "published",
            source: "automation",
            automation_name: automation.name,
          })
          .select()
          .single();

        if (articleError) throw articleError;
        articleId = article.id;

        // Publish to all selected destinations
        const destMap: Record<string, string> = {
          wordpress: "wordpress-publish",
          framer: "publish-to-framer",
          notion: "sync-to-notion",
          shopify: "sync-to-shopify",
          intercom: "sync-to-intercom",
        };

        for (const dest of automation.publish_destinations || []) {
          const fnName = destMap[dest];
          if (!fnName) continue;
          try {
            const payload = dest === "wordpress"
              ? { action: "publish", article_id: article.id }
              : { article_id: article.id, title, slug, content: finalContent };

            await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "x-user-id": automation.user_id,
              },
              body: JSON.stringify(payload),
            });
            console.log(`✓ Published to ${dest}`);
          } catch (destErr) {
            console.error(`Failed to publish to ${dest}:`, destErr);
          }
        }

        // Send email notification if configured
        if (automation.notify_email) {
          try {
            const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
            if (!RESEND_API_KEY) {
              console.warn("RESEND_API_KEY not set — skipping email notification");
            } else {
              const articleUrl = articleId
                ? `https://contentlab.skillstudio.ai/edit/${articleId}`
                : "https://contentlab.skillstudio.ai/dashboard";

              const emailBody = {
                from: "ContentLab <noreply@contentlab.skillstudio.ai>",
                to: [automation.notify_email],
                subject: errorMessage
                  ? `⚠️ Automation "${automation.name}" failed`
                  : `✅ Automation "${automation.name}" published a new article`,
                html: errorMessage
                  ? `<p>Your automation <strong>${automation.name}</strong> ran but encountered an error:</p><p><code>${errorMessage}</code></p><p>Check your <a href="https://contentlab.skillstudio.ai/automations">Automations page</a> for details.</p>`
                  : `<p>Your automation <strong>${automation.name}</strong> successfully generated and published a new article.</p><p><a href="${articleUrl}" style="background:#2563EB;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px;">View Article →</a></p><p style="color:#888;font-size:12px;margin-top:24px;">You're receiving this because you enabled email notifications for this automation. <a href="https://contentlab.skillstudio.ai/automations">Manage automations</a></p>`,
              };

              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${RESEND_API_KEY}`,
                },
                body: JSON.stringify(emailBody),
              });
              console.log(`Email notification sent to ${automation.notify_email}`);
            }
          } catch (emailErr) {
            console.error("Failed to send email notification:", emailErr);
          }
        }

        results.push({ automation_id: automation.id, status: "success", article_id: articleId });

      } catch (err: any) {
        errorMessage = err.message || "Unknown error";
        console.error(`Automation ${automation.id} failed:`, errorMessage);
        results.push({ automation_id: automation.id, status: "failed", error: errorMessage });
      }

      // Log run
      await adminSupabase.from("automation_runs").insert({
        automation_id: automation.id,
        article_id: articleId,
        status: errorMessage ? "failed" : "success",
        error_message: errorMessage,
        resolved_prompt: resolvedPrompt,
      });

      // Calculate next run time based on cron expression
      const nextRun = calculateNextRun(automation.cron_expression);
      await adminSupabase.from("automations").update({
        next_run_at: nextRun,
        updated_at: new Date().toISOString(),
      }).eq("id", automation.id);
    }

    return new Response(JSON.stringify({ ran: automations.length, results }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

function calculateNextRun(cron: string): string {
  // Simple cron parser for: minute hour day month weekday
  const parts = cron.split(" ");
  const now = new Date();
  const next = new Date(now);

  // Daily: "0 H * * *"
  // Weekly: "0 H * * DOW"
  // Monthly: "0 H D * *"

  const minute = parseInt(parts[0]) || 0;
  const hour = parseInt(parts[1]) || 9;
  const day = parts[2];
  const dow = parts[4];

  next.setMinutes(minute, 0, 0);
  next.setHours(hour);

  if (dow !== "*") {
    // Weekly — advance to next occurrence of day of week
    const targetDow = parseInt(dow);
    let daysAhead = targetDow - next.getDay();
    if (daysAhead <= 0) daysAhead += 7;
    next.setDate(next.getDate() + daysAhead);
  } else if (day !== "*") {
    // Monthly
    next.setDate(parseInt(day));
    if (next <= now) next.setMonth(next.getMonth() + 1);
  } else {
    // Daily
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}
