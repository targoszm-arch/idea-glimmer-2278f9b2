import React, { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Loader2, Search, ExternalLink } from "lucide-react";

const UNSPLASH_ACCESS_KEY = ""; // Public API — we use the demo endpoint

interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string; full: string };
  alt_description: string | null;
  user: { name: string; links: { html: string } };
  links: { html: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, credit: string) => void;
}

export function UnsplashPicker({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UnsplashPhoto | null>(null);
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async (q: string, p = 1) => {
    if (!q.trim()) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&page=${p}&per_page=20&orientation=landscape`,
        {
          headers: {
            Authorization: `Client-ID ${import.meta.env.VITE_UNSPLASH_ACCESS_KEY || "Dp5_GpCwzNvYJt7lnKz3vWpTacmNxvOHXAJJWkU8kGs"}`,
          },
        }
      );
      const data = await res.json();
      if (p === 1) {
        setPhotos(data.results || []);
      } else {
        setPhotos(prev => [...prev, ...(data.results || [])]);
      }
      setPage(p);
    } catch (e) {
      console.error("Unsplash search failed:", e);
    }
    setLoading(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { setSelected(null); search(query, 1); }
  };

  const handleConfirm = () => {
    if (!selected) return;
    const credit = `Photo by [${selected.user.name}](${selected.user.links.html}?utm_source=contentlab&utm_medium=referral) on [Unsplash](https://unsplash.com/?utm_source=contentlab&utm_medium=referral)`;
    onSelect(selected.urls.regular, credit);
    onClose();
  };

  const handleClose = () => {
    setSelected(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 32 32" fill="currentColor">
              <path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/>
            </svg>
            Unsplash Photos
          </DialogTitle>
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search free photos (e.g. 'business', 'technology', 'nature')…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                autoFocus
              />
            </div>
            <Button
              onClick={() => { setSelected(null); search(query, 1); }}
              disabled={loading || !query.trim()}
              size="sm"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!hasSearched && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <svg className="h-10 w-10 opacity-30" viewBox="0 0 32 32" fill="currentColor">
                <path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/>
              </svg>
              <p className="text-sm font-medium">Search millions of free photos</p>
              <p className="text-xs">Powered by Unsplash</p>
            </div>
          )}

          {hasSearched && !loading && photos.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No photos found for "{query}". Try a different search.
            </div>
          )}

          {photos.length > 0 && (
            <>
              <div className="columns-2 md:columns-3 gap-3 space-y-3">
                {photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => setSelected(photo)}
                    className={`w-full block relative overflow-hidden rounded-lg break-inside-avoid transition-all ${
                      selected?.id === photo.id
                        ? "ring-2 ring-primary ring-offset-2"
                        : "hover:opacity-90"
                    }`}
                  >
                    <img
                      src={photo.urls.small}
                      alt={photo.alt_description || "Unsplash photo"}
                      className="w-full object-cover"
                      loading="lazy"
                    />
                    {selected?.id === photo.id && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="bg-primary text-primary-foreground rounded-full p-1.5">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <path d="M20 6 9 17l-5-5"/>
                          </svg>
                        </div>
                      </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 hover:opacity-100 transition-opacity">
                      <p className="text-white text-[10px] truncate">{photo.user.name}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex justify-center mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => search(query, page + 1)}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Load more
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Photos from{" "}
            <a href="https://unsplash.com/?utm_source=contentlab&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground inline-flex items-center gap-0.5">
              Unsplash <ExternalLink className="h-2.5 w-2.5" />
            </a>
            {" "}— free to use
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>Cancel</Button>
            <Button size="sm" disabled={!selected} onClick={handleConfirm}>
              Use This Photo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
