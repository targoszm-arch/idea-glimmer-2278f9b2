import React, { useEffect, useState } from "react";
import PageLayout from "../components/PageLayout";
import { Button } from "../components/ui/button";
import { Copy, Trash2, ExternalLink, Sparkles, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { listLibraryImages, deleteLibraryImage, type LibraryImage, type LibrarySource } from "@/lib/imageLibrary";

const SOURCE_BADGE: Record<LibrarySource, { label: string; className: string; icon: React.ReactNode }> = {
  ai_generated: { label: "AI", className: "bg-purple-100 text-purple-700", icon: <Sparkles className="h-2.5 w-2.5" /> },
  upload:       { label: "Upload", className: "bg-gray-100 text-gray-700", icon: <Upload className="h-2.5 w-2.5" /> },
  unsplash:     { label: "Unsplash", className: "bg-amber-100 text-amber-700", icon: <ImageIcon className="h-2.5 w-2.5" /> },
  canva:        { label: "Canva", className: "bg-blue-100 text-blue-700", icon: <ImageIcon className="h-2.5 w-2.5" /> },
};

export default function MediaLibrary() {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | LibrarySource>("all");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setImages(await listLibraryImages());
    setLoading(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const result = await deleteLibraryImage(id);
    if (result.ok) {
      setImages(prev => prev.filter(d => d.id !== id));
      toast.success("Image deleted");
    } else {
      toast.error(result.error || "Delete failed");
    }
    setDeleting(null);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  }

  const filtered = filter === "all" ? images : images.filter(i => i.source === filter);
  const counts = {
    all: images.length,
    ai_generated: images.filter(i => i.source === "ai_generated").length,
    upload: images.filter(i => i.source === "upload").length,
    unsplash: images.filter(i => i.source === "unsplash").length,
    canva: images.filter(i => i.source === "canva").length,
  };

  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Media Library</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All your saved images — AI-generated covers, uploads, Unsplash picks, and Canva designs. Reuse any of them when setting an article cover.
        </p>
      </div>

      {/* Source filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {(["all", "ai_generated", "upload", "unsplash", "canva"] as const).map(f => {
          const label = f === "all" ? "All" : SOURCE_BADGE[f].label;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
              <span className="opacity-70 ml-1">({counts[f]})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-video bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <p className="text-lg font-medium mb-2">
            {images.length === 0 ? "No images saved yet" : "No images match this filter"}
          </p>
          <p className="text-sm">
            {images.length === 0
              ? "Generate or upload a cover image and click \"Save to Library\" to keep it here for reuse."
              : "Try a different source filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((img) => {
            const badge = SOURCE_BADGE[img.source];
            return (
              <div key={img.id} className="group relative rounded-lg overflow-hidden border border-border bg-card">
                <div className="aspect-video bg-muted">
                  <img src={img.image_url} alt={img.title} className="w-full h-full object-cover" loading="lazy" />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-foreground truncate">{img.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.className}`}>
                      {badge.icon}{badge.label}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(img.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copyUrl(img.image_url)} title="Copy URL">
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => window.open(img.image_url, "_blank")} title="Open image">
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(img.id)} disabled={deleting === img.id} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
