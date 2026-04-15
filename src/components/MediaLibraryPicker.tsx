import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, ImageOff } from "lucide-react";
import { listLibraryImages, type LibraryImage, type LibrarySource } from "@/lib/imageLibrary";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

const SOURCE_LABEL: Record<LibrarySource, string> = {
  ai_generated: "AI",
  upload: "Upload",
  unsplash: "Unsplash",
  canva: "Canva",
};

const SOURCE_BADGE_CLASS: Record<LibrarySource, string> = {
  ai_generated: "bg-purple-500/80 text-white",
  upload: "bg-gray-600/80 text-white",
  unsplash: "bg-amber-500/80 text-white",
  canva: "bg-blue-600/80 text-white",
};

// Unified picker across AI-generated covers, uploads, Unsplash picks, and
// Canva designs — all read from listLibraryImages() so this stays in sync
// with the Media Library page automatically.
export function MediaLibraryPicker({ open, onClose, onSelect }: Props) {
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | LibrarySource>("all");

  useEffect(() => {
    if (open) { setSelected(null); setFilter("all"); load(); }
  }, [open]);

  async function load() {
    setLoading(true);
    setImages(await listLibraryImages());
    setLoading(false);
  }

  function handleConfirm() {
    if (selected) { onSelect(selected); onClose(); }
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick from Media Library</DialogTitle>
        </DialogHeader>

        {/* Source filter — only show sources that have images */}
        {!loading && images.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {(["all", "ai_generated", "upload", "unsplash", "canva"] as const)
              .filter(f => f === "all" || counts[f] > 0)
              .map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    filter === f ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f === "all" ? "All" : SOURCE_LABEL[f]}
                  <span className="opacity-70 ml-1">({counts[f]})</span>
                </button>
              ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm font-medium">
                {images.length === 0 ? "No images saved yet" : "No images in this source"}
              </p>
              <p className="text-xs text-center max-w-xs">
                {images.length === 0
                  ? "Generate a cover image and click \"Save to Library\" to reuse it across articles."
                  : "Try a different source or save more images."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 p-1">
              {filtered.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setSelected(img.image_url)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video bg-muted ${
                    selected === img.image_url
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  <img src={img.image_url} alt={img.title} className="w-full h-full object-cover" loading="lazy" />
                  <span className={`absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${SOURCE_BADGE_CLASS[img.source]}`}>
                    {SOURCE_LABEL[img.source]}
                  </span>
                  {selected === img.image_url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="bg-primary text-primary-foreground rounded-full p-1">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-white text-[10px] truncate">{img.title}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!selected}>
            Use This Image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
