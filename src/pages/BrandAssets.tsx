import { useState, useEffect, useRef } from "react";
import { Upload, Trash2, Image, Star, FileImage, Loader2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type BrandAsset = {
  id: string;
  name: string;
  type: string;
  file_url: string;
  file_name: string;
  created_at: string;
};

const assetTypes = [
  { key: "logo", label: "Logos", icon: Star },
  { key: "visual", label: "Visuals", icon: Image },
  { key: "guideline", label: "Guidelines", icon: FileImage },
] as const;

type AssetType = (typeof assetTypes)[number]["key"];

const BrandAssets = () => {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<AssetType>("logo");
  const [previewAsset, setPreviewAsset] = useState<BrandAsset | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAssets();
  }, []);

  const fetchAssets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("brand_assets")
      .select("*")
      .order("created_at", { ascending: false });
    if (data && !error) setAssets(data as BrandAsset[]);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAssets: BrandAsset[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop();
      const path = `${activeTab}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("brand-assets")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        continue;
      }

      const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);

      const { data: row, error: insertError } = await supabase
        .from("brand_assets")
        .insert({
          name: file.name.replace(/\.[^.]+$/, ""),
          type: activeTab,
          file_url: urlData.publicUrl,
          file_name: path,
        })
        .select()
        .single();

      if (row && !insertError) newAssets.push(row as BrandAsset);
    }

    if (newAssets.length > 0) {
      setAssets((prev) => [...newAssets, ...prev]);
      toast({ title: `${newAssets.length} file(s) uploaded` });
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (asset: BrandAsset) => {
    const { error: storageError } = await supabase.storage
      .from("brand-assets")
      .remove([asset.file_name]);

    const { error: dbError } = await supabase
      .from("brand_assets")
      .delete()
      .eq("id", asset.id);

    if (!storageError && !dbError) {
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      toast({ title: "Asset deleted" });
    } else {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const filtered = assets.filter((a) => a.type === activeTab);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Brand Assets</h1>
            <p className="text-muted-foreground mt-1">
              Upload logos, visuals, and brand guidelines. These will be used in AI-generated content.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-6">
          {assetTypes.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  activeTab === t.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                <span className="ml-1 text-xs opacity-70">
                  ({assets.filter((a) => a.type === t.key).length})
                </span>
              </button>
            );
          })}
        </div>

        {/* Upload area */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="mb-8 border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.svg"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Uploading...
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Upload className="h-8 w-8" />
              <p className="font-medium">Click or drag files to upload {assetTypes.find((t) => t.key === activeTab)?.label.toLowerCase()}</p>
              <p className="text-xs">PNG, JPG, SVG, PDF — up to 20MB each</p>
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Image className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No {assetTypes.find((t) => t.key === activeTab)?.label.toLowerCase()} yet</p>
            <p className="text-sm">Upload your first asset above</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map((asset) => (
              <motion.div
                key={asset.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="group relative rounded-xl border border-border bg-card overflow-hidden"
              >
                <div
                  className="aspect-square bg-muted flex items-center justify-center cursor-pointer overflow-hidden"
                  onClick={() => setPreviewAsset(asset)}
                >
                  <img
                    src={asset.file_url}
                    alt={asset.name}
                    className="w-full h-full object-contain p-2"
                    loading="lazy"
                  />
                </div>
                <div className="p-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground truncate flex-1">
                    {asset.name}
                  </span>
                  <button
                    onClick={() => handleDelete(asset)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-destructive transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Preview modal */}
        <AnimatePresence>
          {previewAsset && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
              onClick={() => setPreviewAsset(null)}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="relative max-w-3xl max-h-[80vh]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setPreviewAsset(null)}
                  className="absolute -top-3 -right-3 bg-background rounded-full p-1.5 shadow-lg"
                >
                  <X className="h-4 w-4" />
                </button>
                <img
                  src={previewAsset.file_url}
                  alt={previewAsset.name}
                  className="max-w-full max-h-[80vh] rounded-xl object-contain"
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <Footer />
    </div>
  );
};

export default BrandAssets;
