import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type UploadPayload = {
  action?: "upload";
  name: string;
  type?: string;
  fileBase64?: string; // base64 string without data: prefix (recommended)
  fileDataUrl?: string; // full data:...;base64,... (supported)
  fileUrl?: string; // remote URL (supported)
  fileName?: string;
  contentType?: string;
};

type DeletePayload = {
  action: "delete";
  id?: string;
  file_name?: string;
};

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const supabaseAuthClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }


    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload = (await req.json()) as UploadPayload | DeletePayload;

    if (payload.action === "delete") {
      const { id, file_name } = payload;
      if (!id && !file_name) throw new Error("id or file_name is required for delete");

      if (file_name) {
        const { error: storageError } = await supabase.storage
          .from("brand-assets")
          .remove([file_name]);
        if (storageError) throw new Error(`Storage delete failed: ${storageError.message}`);
      }

      // SECURITY: always filter by user_id to prevent deleting other users' assets
      const del = supabase.from("brand_assets").delete().eq("user_id", user.id);
      const { error: dbError } = id ? await del.eq("id", id) : await del.eq("file_name", file_name!);
      if (dbError) throw new Error(`Database delete failed: ${dbError.message}`);

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload
    const {
      name,
      type = "logo",
      fileBase64,
      fileDataUrl,
      fileUrl,
      fileName = "asset",
      contentType = "application/octet-stream",
    } = payload;

    if (!name) throw new Error("name is required");

    let bytes: Uint8Array;
    let resolvedContentType = contentType;

    if (fileBase64) {
      bytes = base64ToBytes(fileBase64);
    } else if (fileDataUrl?.startsWith("data:")) {
      const match = fileDataUrl.match(/^data:(.+?);base64,(.+)$/);
      if (!match) throw new Error("Invalid fileDataUrl");
      resolvedContentType = match[1];
      bytes = base64ToBytes(match[2]);
    } else if (fileUrl) {
      // SSRF protection: only allow HTTPS URLs from trusted domains
      let parsed: URL;
      try { parsed = new URL(fileUrl); } catch { throw new Error("Invalid fileUrl"); }
      if (parsed.protocol !== 'https:') throw new Error("Only HTTPS URLs are allowed");
      const blockedPatterns = ['169.254.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '127.', '0.', 'localhost', '[::1]'];
      if (blockedPatterns.some(p => parsed.hostname.includes(p))) throw new Error("Internal URLs are not allowed");
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
      resolvedContentType = res.headers.get("content-type") || resolvedContentType;
      bytes = new Uint8Array(await res.arrayBuffer());
    } else {
      throw new Error("Provide fileBase64, fileDataUrl, or fileUrl");
    }

    const extFromName = fileName.includes(".") ? fileName.split(".").pop() : undefined;
    const extFromType = resolvedContentType.split("/")[1];
    const ext = (extFromName || extFromType || "bin").replace(/[^a-z0-9]/gi, "");

    const path = `${type}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("brand-assets")
      .upload(path, bytes, {
        contentType: resolvedContentType,
        upsert: false,
      });

    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

    const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);

    const { data: asset, error: insertError } = await supabase
      .from("brand_assets")
      .insert({
        user_id: user.id,
        name,
        type,
        file_url: urlData.publicUrl,
        file_name: path,
      })
      .select()
      .single();

    if (insertError) throw new Error(`Database insert failed: ${insertError.message}`);

    return new Response(JSON.stringify(asset), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("upload-brand-asset error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
