import React, { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface UnsplashPhoto {
  id: string;
  urls: { small: string; regular: string };
  alt_description: string;
  user: { name: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}

export function ImageLibraryPicker({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<UnsplashPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setHasSearched(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/unsplash-search?query=${encodeURIComponent(q)}&per_page=18&orientation=landscape`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPhotos(data.results || []);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected);
    handleClose();
  }

  function handleClose() {
    setQuery("");
    setPhotos([]);
    setSelected(null);
    setHasSearched(false);
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {/* Unsplash wordmark U */}
            <svg className="h-4 w-4" viewBox="0 0 32 32" fill="currentColor">
              <path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/>
            </svg>
            Image Library
            <span className="text-xs font-normal text-muted-foreground ml-1">powered by Unsplash</span>
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="flex gap-2">
          <Input
            placeholder="Search free photos… e.g. 'technology', 'business', 'marketing'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(query)}
            className="flex-1"
            autoFocus
          />
          <Button onClick={() => search(query)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && error && (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && !hasSearched && (
          <div className="py-10 text-center">
            <svg className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" viewBox="0 0 32 32" fill="currentColor">
              <path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/>
            </svg>
            <p className="text-sm text-muted-foreground">Search millions of free high-quality photos</p>
          </div>
        )}

        {!loading && !error && hasSearched && photos.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No photos found for "{query}" — try different keywords
          </div>
        )}

        {!loading && photos.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-2 max-h-[380px] overflow-y-auto pr-1">
              {photos.map((photo) => (
                <button
                  key={photo.id}
                  onClick={() => setSelected(photo.urls.regular)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video bg-muted group
                    ${selected === photo.urls.regular
                      ? "border-primary shadow-md"
                      : "border-transparent hover:border-primary/40"}`}
                >
                  <img
                    src={photo.urls.small}
                    alt={photo.alt_description}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {selected === photo.urls.regular && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="h-6 w-6 text-white drop-shadow" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-[10px] truncate">📷 {photo.user.name}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:underline"
              >
                Photos from Unsplash
              </a>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleConfirm} disabled={!selected}>
                  Use This Photo
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
