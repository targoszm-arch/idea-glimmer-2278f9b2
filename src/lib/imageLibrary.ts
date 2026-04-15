// Shared helpers for the user's saved image library.
//
// The Media Library shows two distinct kinds of images:
//   1. Canva designs — pulled in via the Canva integration, stored in the
//      `canva_designs` table (already existed).
//   2. Saved covers / uploads / Unsplash picks — anything the user actively
//      saves for reuse, stored in `brand_assets` with type prefix
//      "image_" so they don't collide with brand logos (type='logo').
//
// `listLibraryImages()` merges both sources into a single sorted list; the
// MediaLibrary page and MediaLibraryPicker both use it so they stay in sync
// and we don't grow a second library surface every time we add a source.

import { supabase } from "@/integrations/supabase/client";

export type LibrarySource = "canva" | "ai_generated" | "upload" | "unsplash";

export interface LibraryImage {
  id: string;
  title: string;
  image_url: string;
  source: LibrarySource;
  created_at: string;
}

const SAVED_IMAGE_TYPES = [
  "image_ai_generated",
  "image_upload",
  "image_unsplash",
];

/**
 * Save an image to the user's reusable library. Returns { ok: true } on
 * success. Use `source='ai_generated'` for covers produced by
 * generate-cover-image; `upload` for user-uploaded files;  `unsplash` for
 * picks from the Unsplash picker.
 */
export async function saveImageToLibrary(opts: {
  imageUrl: string;
  title: string;
  source: Exclude<LibrarySource, "canva">;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in" };
    const fileName = opts.imageUrl.split("?")[0].split("/").pop() || "image.png";
    const { error } = await supabase.from("brand_assets" as any).insert({
      user_id: user.id,
      file_url: opts.imageUrl,
      file_name: fileName,
      name: opts.title?.trim() || "Saved image",
      type: `image_${opts.source}`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Unknown error" };
  }
}

/**
 * Unified list of everything the user has in their image library. Merges
 * Canva designs and saved brand_assets, sorted by `created_at` desc.
 */
export async function listLibraryImages(): Promise<LibraryImage[]> {
  const [canva, saved] = await Promise.all([
    supabase
      .from("canva_designs" as any)
      .select("id, title, image_url, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("brand_assets" as any)
      .select("id, name, file_url, type, created_at")
      .in("type", SAVED_IMAGE_TYPES)
      .order("created_at", { ascending: false }),
  ]);

  const fromCanva: LibraryImage[] = (canva.data ?? []).map((d: any) => ({
    id: `canva:${d.id}`,
    title: d.title,
    image_url: d.image_url,
    source: "canva",
    created_at: d.created_at,
  }));
  const fromSaved: LibraryImage[] = (saved.data ?? []).map((a: any) => ({
    id: `asset:${a.id}`,
    title: a.name,
    image_url: a.file_url,
    source: ((a.type as string).replace(/^image_/, "") as LibrarySource) || "ai_generated",
    created_at: a.created_at,
  }));

  return [...fromCanva, ...fromSaved].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

/** Delete a LibraryImage by its synthetic id (from `listLibraryImages`). */
export async function deleteLibraryImage(id: string): Promise<{ ok: boolean; error?: string }> {
  const [prefix, realId] = id.split(":");
  try {
    if (prefix === "canva") {
      const { error } = await supabase.from("canva_designs" as any).delete().eq("id", realId);
      if (error) return { ok: false, error: error.message };
    } else if (prefix === "asset") {
      const { error } = await supabase.from("brand_assets" as any).delete().eq("id", realId);
      if (error) return { ok: false, error: error.message };
    } else {
      return { ok: false, error: "Unknown library id prefix" };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Unknown error" };
  }
}
