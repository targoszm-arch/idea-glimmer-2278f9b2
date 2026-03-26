import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ImageOff, Check } from "lucide-react";

interface CanvaDesign {
  id: string;
  image_url: string;
  name: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
}

export function CanvaDesignPicker({ open, onClose, onSelect }: Props) {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoading(true);
    supabase
      .from("canva_designs")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDesigns((data as CanvaDesign[]) || []);
        setLoading(false);
      });
  }, [open]);

  function handleConfirm() {
    if (!selected) return;
    onSelect(selected);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img
              src="https://upload.wikimedia.org/wikipedia/en/b/bb/Canva_Logo.png"
              alt="Canva"
              className="h-5 w-5 object-contain"
            />
            Choose a Canva Design
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && designs.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <ImageOff className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No Canva designs saved yet.</p>
            <p className="text-xs text-muted-foreground/70">
              Open the ContentLab app inside Canva, design your graphic, and click&nbsp;
              <strong>"Save Design to ContentLab"</strong>.
            </p>
          </div>
        )}

        {!loading && designs.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-1">
              {designs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d.image_url)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square bg-muted group
                    ${selected === d.image_url
                      ? "border-primary shadow-md"
                      : "border-transparent hover:border-primary/40"}`}
                >
                  <img
                    src={d.image_url}
                    alt={d.name}
                    className="w-full h-full object-cover"
                  />
                  {selected === d.image_url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <Check className="h-6 w-6 text-white drop-shadow" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-white text-xs truncate">{d.name}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleConfirm} disabled={!selected}>
                Use This Design
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
