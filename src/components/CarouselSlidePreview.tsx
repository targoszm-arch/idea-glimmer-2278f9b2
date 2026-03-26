import { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, Copy, Check, Library, Loader2, CalendarPlus } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Slide = {
  type: "cover" | "content" | "cta";
  headline: string;
  body?: string;
  accent_text?: string;
  bg_style?: string;
  icon_hint?: string;
};

type CarouselData = {
  caption: string;
  slides: Slide[];
};

export type { CarouselData };

const bgStyles: Record<string, string> = {
  gradient_blue: "bg-gradient-to-br from-blue-600 to-blue-900",
  gradient_purple: "bg-gradient-to-br from-purple-600 to-indigo-900",
  gradient_orange: "bg-gradient-to-br from-orange-500 to-red-700",
  gradient_green: "bg-gradient-to-br from-emerald-500 to-teal-800",
  gradient_dark: "bg-gradient-to-br from-gray-800 to-gray-950",
  solid_dark: "bg-gray-900",
  solid_light: "bg-white",
};

// Inline hex colours for html2canvas (Tailwind JIT doesn't run in canvas)
const bgColors: Record<string, string> = {
  gradient_blue: "#1d4ed8",
  gradient_purple: "#7c3aed",
  gradient_orange: "#ea580c",
  gradient_green: "#059669",
  gradient_dark: "#1f2937",
  solid_dark: "#111827",
  solid_light: "#ffffff",
};

const getIcon = (hint?: string) => {
  if (!hint) return null;
  const name = hint.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
  const Icon = (LucideIcons as any)[name];
  return Icon || null;
};

export function parseCarouselContent(content: string): CarouselData | null {
  try {
    const parsed = JSON.parse(content.trim());
    if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
    return null;
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
      } catch {}
    }
    const jsonMatch = content.match(/\{[\s\S]*"slides"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
      } catch {}
    }
    return null;
  }
}

// Renders a single slide as a self-contained div for html2canvas capture
function SlideCanvas({ slide, index, total, size = 500 }: { slide: Slide; index: number; total: number; size?: number }) {
  const isLight = slide.bg_style === "solid_light";
  const textColor = isLight ? "#111827" : "#ffffff";
  const subTextColor = isLight ? "#4b5563" : "rgba(255,255,255,0.8)";
  const accentColor = isLight ? "#2563eb" : "#fde047";
  const bg = bgColors[slide.bg_style || "gradient_dark"] || bgColors.gradient_dark;
  const IconComponent = getIcon(slide.icon_hint);

  return (
    <div
      style={{
        width: size, height: size,
        background: bg,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 40, textAlign: "center",
        position: "relative", overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Slide number */}
      <div style={{ position: "absolute", top: 16, left: 16, background: "rgba(255,255,255,0.2)", color: isLight ? "#374151" : "#fff", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700 }}>
        {index + 1}/{total}
      </div>

      {/* Cover decoration */}
      {slide.type === "cover" && (
        <>
          <div style={{ position: "absolute", top: 20, right: 20, width: 100, height: 100, borderRadius: "50%", border: `2px solid rgba(255,255,255,0.15)` }} />
          <div style={{ position: "absolute", bottom: 30, left: 24, width: 60, height: 60, borderRadius: "50%", border: `1px solid rgba(255,255,255,0.1)` }} />
        </>
      )}

      {/* Accent label (cover) */}
      {slide.type === "cover" && (
        <p style={{ color: accentColor, fontSize: 11, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
          ContentLab
        </p>
      )}

      {/* Accent text */}
      {slide.accent_text && (
        <p style={{ color: accentColor, fontSize: 12, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8 }}>
          {slide.accent_text}
        </p>
      )}

      {/* Headline */}
      <h2 style={{ color: textColor, fontSize: slide.type === "cover" ? 26 : 22, fontWeight: 900, lineHeight: 1.25, marginBottom: 12, maxWidth: 380 }}>
        {slide.headline}
      </h2>

      {/* Body */}
      {slide.body && (
        <p style={{ color: subTextColor, fontSize: 14, lineHeight: 1.6, maxWidth: 340 }}>
          {slide.body}
        </p>
      )}

      {/* CTA button */}
      {slide.type === "cta" && (
        <div style={{ marginTop: 20, padding: "10px 24px", borderRadius: 999, background: isLight ? "#2563eb" : "#fff", color: isLight ? "#fff" : "#111827", fontWeight: 700, fontSize: 14 }}>
          Learn More →
        </div>
      )}

      {/* Dots */}
      <div style={{ position: "absolute", bottom: 16, display: "flex", gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{ width: i === index ? 16 : 8, height: 8, borderRadius: 999, background: isLight ? (i === index ? "#111827" : "#9ca3af") : (i === index ? "#fff" : "rgba(255,255,255,0.4)"), transition: "width 0.3s" }} />
        ))}
      </div>
    </div>
  );
}

export default function CarouselSlidePreview({
  data,
  postTitle,
  onSchedule,
}: {
  data: CarouselData;
  postTitle?: string;
  onSchedule?: (imageUrl: string) => void;
}) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const slide = data.slides[currentSlide];
  if (!slide) return null;

  const isLight = slide.bg_style === "solid_light";
  const textColor = isLight ? "text-gray-900" : "text-white";
  const subTextColor = isLight ? "text-gray-600" : "text-white/80";
  const accentColor = isLight ? "text-blue-600" : "text-yellow-300";
  const bgClass = bgStyles[slide.bg_style || "gradient_dark"] || bgStyles.gradient_dark;
  const IconComponent = getIcon(slide.icon_hint);

  const handleCopyCaption = () => {
    navigator.clipboard.writeText(data.caption);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
    toast({ title: "Caption copied!" });
  };

  // Capture all slides → PDF using dynamic import
  const captureAllSlides = useCallback(async (): Promise<Blob> => {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const SLIDE_SIZE = 500;
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [SLIDE_SIZE, SLIDE_SIZE] });

    for (let i = 0; i < data.slides.length; i++) {
      if (i > 0) pdf.addPage([SLIDE_SIZE, SLIDE_SIZE], "portrait");

      // Create temp container
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:500px;height:500px;";
      document.body.appendChild(container);

      // Render slide content via innerHTML
      const s = data.slides[i];
      const bg = bgColors[s.bg_style || "gradient_dark"] || bgColors.gradient_dark;
      const isLt = s.bg_style === "solid_light";
      const tc = isLt ? "#111827" : "#ffffff";
      const ac = isLt ? "#2563eb" : "#fde047";
      const sc = isLt ? "#4b5563" : "rgba(255,255,255,0.8)";

      container.innerHTML = `
        <div style="width:500px;height:500px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;position:relative;overflow:hidden;font-family:Inter,system-ui,sans-serif;">
          <div style="position:absolute;top:16px;left:16px;background:rgba(255,255,255,0.2);color:${tc};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;">${i + 1}/${data.slides.length}</div>
          ${s.type === "cover" ? `<div style="position:absolute;top:20px;right:20px;width:100px;height:100px;border-radius:50%;border:2px solid rgba(255,255,255,0.15);"></div><div style="position:absolute;bottom:30px;left:24px;width:60px;height:60px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);"></div>` : ""}
          ${s.type === "cover" ? `<p style="color:${ac};font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:12px;">ContentLab</p>` : ""}
          ${s.accent_text ? `<p style="color:${ac};font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px;">${s.accent_text}</p>` : ""}
          <h2 style="color:${tc};font-size:${s.type === "cover" ? 26 : 22}px;font-weight:900;line-height:1.25;margin-bottom:12px;max-width:380px;">${s.headline}</h2>
          ${s.body ? `<p style="color:${sc};font-size:14px;line-height:1.6;max-width:340px;">${s.body}</p>` : ""}
          ${s.type === "cta" ? `<div style="margin-top:20px;padding:10px 24px;border-radius:999px;background:${isLt ? "#2563eb" : "#fff"};color:${isLt ? "#fff" : "#111827"};font-weight:700;font-size:14px;">Learn More →</div>` : ""}
          <div style="position:absolute;bottom:16px;display:flex;gap:6px;">
            ${Array.from({ length: data.slides.length }).map((_, di) =>
              `<div style="width:${di === i ? 16 : 8}px;height:8px;border-radius:999px;background:${isLt ? (di === i ? "#111827" : "#9ca3af") : (di === i ? "#fff" : "rgba(255,255,255,0.4)")};"></div>`
            ).join("")}
          </div>
        </div>`;

      const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
        scale: 2, useCORS: true, backgroundColor: null,
        width: SLIDE_SIZE, height: SLIDE_SIZE,
      });
      document.body.removeChild(container);

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, SLIDE_SIZE, SLIDE_SIZE);
    }

    return pdf.output("blob");
  }, [data]);

  const handleDownloadPDF = async () => {
    setDownloading(true);
    try {
      const blob = await captureAllSlides();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carousel-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF downloaded!", description: `${data.slides.length} slides exported.` });
    } catch (e) {
      console.error(e);
      toast({ title: "Download failed", description: "Could not generate PDF.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    setSavingToLibrary(true);
    try {
      // 1) Capture first slide as cover image
      const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);
      const s = data.slides[0];
      const bg = bgColors[s.bg_style || "gradient_dark"] || bgColors.gradient_dark;
      const isLt = s.bg_style === "solid_light";
      const tc = isLt ? "#111827" : "#ffffff";
      const ac = isLt ? "#2563eb" : "#fde047";
      const sc = isLt ? "#4b5563" : "rgba(255,255,255,0.8)";

      const container = document.createElement("div");
      container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:500px;height:500px;";
      container.innerHTML = `
        <div style="width:500px;height:500px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;position:relative;overflow:hidden;font-family:Inter,system-ui,sans-serif;">
          ${s.type === "cover" ? `<div style="position:absolute;top:20px;right:20px;width:100px;height:100px;border-radius:50%;border:2px solid rgba(255,255,255,0.15);"></div>` : ""}
          ${s.type === "cover" ? `<p style="color:${ac};font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;margin-bottom:12px;">ContentLab</p>` : ""}
          ${s.accent_text ? `<p style="color:${ac};font-size:12px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px;">${s.accent_text}</p>` : ""}
          <h2 style="color:${tc};font-size:26px;font-weight:900;line-height:1.25;margin-bottom:12px;max-width:380px;">${s.headline}</h2>
          ${s.body ? `<p style="color:${sc};font-size:14px;line-height:1.6;max-width:340px;">${s.body}</p>` : ""}
          <div style="position:absolute;bottom:8px;right:12px;font-size:9px;color:rgba(255,255,255,0.4);font-weight:600;">ContentLab • ${data.slides.length} slides</div>
        </div>`;
      document.body.appendChild(container);
      const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, useCORS: true, backgroundColor: null, width: 500, height: 500 });
      document.body.removeChild(container);

      // 2) Convert canvas to blob
      const imageBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png", 0.95));

      // 3) Upload to Supabase storage
      const fileName = `carousel-${Date.now()}.png`;
      const { data: upData, error: upErr } = await supabase.storage
        .from("article-covers")
        .upload(`covers/${fileName}`, imageBlob, { contentType: "image/png" });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from("article-covers").getPublicUrl(`covers/${fileName}`);
      const publicUrl = urlData.publicUrl;

      // 4) Save to canva_designs library
      const { error: dbErr } = await supabase.from("canva_designs").insert({
        title: postTitle || s.headline || "IG Carousel",
        image_url: publicUrl,
      });
      if (dbErr) throw dbErr;

      toast({ title: "Saved to Media Library! ✓", description: "Find it under Brand → Media Library." });
    } catch (e) {
      console.error(e);
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSavingToLibrary(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Slide viewer */}
      <div className="relative mx-auto" style={{ maxWidth: 400 }}>
        <div
          ref={slideRef}
          className={cn(
            "aspect-square rounded-2xl flex flex-col items-center justify-center p-8 text-center relative overflow-hidden transition-all duration-300",
            bgClass
          )}
        >
          {slide.type === "cover" && (
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-6 right-6 w-32 h-32 rounded-full border-2 border-current" />
              <div className="absolute bottom-10 left-8 w-20 h-20 rounded-full border border-current" />
            </div>
          )}
          <div className={cn("absolute top-4 left-4 text-xs font-bold px-2 py-1 rounded-full", isLight ? "bg-gray-200 text-gray-600" : "bg-white/20 text-white/70")}>
            {currentSlide + 1}/{data.slides.length}
          </div>
          {IconComponent && (
            <div className={cn("mb-4", accentColor)}>
              <IconComponent className="h-10 w-10" />
            </div>
          )}
          {slide.type === "cover" && (
            <span className={cn("text-xs font-bold uppercase tracking-[0.2em] mb-3", accentColor)}>
              ContentLab
            </span>
          )}
          {slide.accent_text && (
            <p className={cn("text-sm font-bold mb-2 tracking-wide uppercase", accentColor)}>
              {slide.accent_text}
            </p>
          )}
          <h2 className={cn("font-black leading-tight mb-3", textColor, slide.type === "cover" ? "text-2xl md:text-3xl" : "text-xl md:text-2xl")}>
            {slide.headline}
          </h2>
          {slide.body && (
            <p className={cn("text-sm leading-relaxed max-w-xs", subTextColor)}>{slide.body}</p>
          )}
          {slide.type === "cta" && (
            <div className={cn("mt-4 px-6 py-2.5 rounded-full font-bold text-sm", isLight ? "bg-blue-600 text-white" : "bg-white text-gray-900")}>
              Learn More →
            </div>
          )}
          <div className="absolute bottom-4 flex gap-1.5">
            {data.slides.map((_, i) => (
              <button key={i} onClick={() => setCurrentSlide(i)}
                className={cn("w-2 h-2 rounded-full transition-all", i === currentSlide ? (isLight ? "bg-gray-900 w-4" : "bg-white w-4") : (isLight ? "bg-gray-400" : "bg-white/40"))}
              />
            ))}
          </div>
        </div>
        {currentSlide > 0 && (
          <button onClick={() => setCurrentSlide((p) => p - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur rounded-full p-1.5 shadow-lg hover:bg-background transition-colors">
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
        )}
        {currentSlide < data.slides.length - 1 && (
          <button onClick={() => setCurrentSlide((p) => p + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur rounded-full p-1.5 shadow-lg hover:bg-background transition-colors">
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 px-1">
        {data.slides.map((s, i) => (
          <button key={i} onClick={() => setCurrentSlide(i)}
            className={cn("flex-shrink-0 w-16 h-16 rounded-lg flex items-center justify-center text-[9px] font-bold text-center p-1.5 transition-all border-2",
              bgStyles[s.bg_style || "gradient_dark"] || bgStyles.gradient_dark,
              s.bg_style === "solid_light" ? "text-gray-900" : "text-white",
              i === currentSlide ? "border-primary ring-2 ring-primary/30 scale-105" : "border-transparent opacity-70 hover:opacity-100"
            )}
          >
            {s.headline.split(" ").slice(0, 3).join(" ")}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownloadPDF}
          disabled={downloading}
          className="gap-1.5 text-xs"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {downloading ? "Generating PDF…" : "Download PDF"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveToLibrary}
          disabled={savingToLibrary}
          className="gap-1.5 text-xs"
        >
          {savingToLibrary ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Library className="h-3.5 w-3.5" />}
          {savingToLibrary ? "Saving…" : "Save to Library"}
        </Button>
        {onSchedule && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              // Save cover image first if needed, then call onSchedule
              setSavingToLibrary(true);
              try {
                const [{ default: html2canvas }] = await Promise.all([import("html2canvas")]);
                const s = data.slides[0];
                const bg = bgColors[s.bg_style || "gradient_dark"] || bgColors.gradient_dark;
                const isLt = s.bg_style === "solid_light";
                const tc = isLt ? "#111827" : "#ffffff";
                const ac = isLt ? "#2563eb" : "#fde047";
                const sc = isLt ? "#4b5563" : "rgba(255,255,255,0.8)";
                const container = document.createElement("div");
                container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:500px;height:500px;";
                container.innerHTML = `<div style="width:500px;height:500px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;position:relative;overflow:hidden;font-family:Inter,system-ui,sans-serif;"><h2 style="color:${tc};font-size:26px;font-weight:900;line-height:1.25;margin-bottom:12px;max-width:380px;">${s.headline}</h2>${s.body ? `<p style="color:${sc};font-size:14px;line-height:1.6;max-width:340px;">${s.body}</p>` : ""}</div>`;
                document.body.appendChild(container);
                const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, useCORS: true, backgroundColor: null, width: 500, height: 500 });
                document.body.removeChild(container);
                const imageBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png", 0.95));
                const fileName = `carousel-sched-${Date.now()}.png`;
                const { error: upErr } = await supabase.storage.from("article-covers").upload(`covers/${fileName}`, imageBlob, { contentType: "image/png" });
                if (upErr) throw upErr;
                const { data: urlData } = supabase.storage.from("article-covers").getPublicUrl(`covers/${fileName}`);
                onSchedule(urlData.publicUrl);
              } catch(e) {
                toast({ title: "Error", description: String(e), variant: "destructive" });
              } finally {
                setSavingToLibrary(false);
              }
            }}
            disabled={savingToLibrary}
            className="gap-1.5 text-xs"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Add to Planner
          </Button>
        )}
      </div>

      {/* Caption */}
      {data.caption && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Caption</span>
            <Button variant="ghost" size="sm" onClick={handleCopyCaption} className="h-7 px-2">
              {copiedCaption ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-sm text-foreground whitespace-pre-wrap">{data.caption}</p>
        </div>
      )}
    </div>
  );
}
