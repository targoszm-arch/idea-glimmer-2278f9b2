import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { supabase } from "../integrations/supabase/client";
import { Button } from "./ui/button";
import { Loader2, ImageOff } from "lucide-react";

interface CanvaDesign {
  id: string;
  title: string;
  image_url: string;
  created_at: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function MediaLibraryPicker({ open, onClose, onSelect }: Props) {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setSelected(null); load(); }
  }, [open]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("canva_designs")
      .select("*")
      .order("created_at", { ascending: false });
    setDesigns(data ?? []);
    setLoading(false);
  }

  function handleSelect(url: string) {
    setSelected(url);
  }

  function handleConfirm() {
    if (selected) { onSelect(selected); onClose(); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Pick from Media Library</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : designs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ImageOff className="h-8 w-8" />
              <p className="text-sm font-medium">No designs yet</p>
              <p className="text-xs">Save a design from Canva and it will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 p-1">
              {designs.map((d) => (
                <button
                  key={d.id}
                  onClick={() => handleSelect(d.image_url)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-video bg-muted ${
                    selected === d.image_url
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-border"
                  }`}
                >
                  <img
                    src={d.image_url}
                    alt={d.title}
                    className="w-full h-full object-cover"
                  />
                  {selected === d.image_url && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <div className="bg-primary text-primary-foreground rounded-full p-1">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M20 6 9 17l-5-5"/>
                        </svg>
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="text-white text-[10px] truncate">{d.title}</p>
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
