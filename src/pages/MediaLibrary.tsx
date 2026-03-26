import React, { useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import PageLayout from "../components/PageLayout";
import { Button } from "../components/ui/button";
import { Copy, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface CanvaDesign {
  id: string;
  title: string;
  image_url: string;
  created_at: string;
}

export default function MediaLibrary() {
  const [designs, setDesigns] = useState<CanvaDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("canva_designs")
      .select("*")
      .order("created_at", { ascending: false });
    setDesigns(data ?? []);
    setLoading(false);
  }

  async function deleteDesign(id: string) {
    setDeleting(id);
    await supabase.from("canva_designs").delete().eq("id", id);
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    setDeleting(null);
    toast.success("Design deleted");
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied to clipboard");
  }

  return (
    <PageLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Media Library</h1>
        <p className="text-muted-foreground mt-1">
          Designs saved from Canva. Copy the URL to attach to blog posts or social media.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="aspect-video bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : designs.length === 0 ? (
        <div className="text-center py-24 text-muted-foreground">
          <p className="text-lg font-medium mb-2">No designs yet</p>
          <p className="text-sm">Save a design from Canva and it will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {designs.map((design) => (
            <div key={design.id} className="group relative rounded-lg overflow-hidden border border-border bg-card">
              <div className="aspect-video bg-muted">
                <img
                  src={design.image_url}
                  alt={design.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-3">
                <p className="text-sm font-medium text-foreground truncate">{design.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(design.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => copyUrl(design.image_url)} title="Copy URL">
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="secondary" onClick={() => window.open(design.image_url, "_blank")} title="Open image">
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => deleteDesign(design.id)} disabled={deleting === design.id} title="Delete">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
