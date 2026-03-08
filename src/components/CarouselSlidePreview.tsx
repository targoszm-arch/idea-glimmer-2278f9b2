import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Copy, Check } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

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

const bgStyles: Record<string, string> = {
  gradient_blue: "bg-gradient-to-br from-blue-600 to-blue-900",
  gradient_purple: "bg-gradient-to-br from-purple-600 to-indigo-900",
  gradient_orange: "bg-gradient-to-br from-orange-500 to-red-700",
  gradient_green: "bg-gradient-to-br from-emerald-500 to-teal-800",
  gradient_dark: "bg-gradient-to-br from-gray-800 to-gray-950",
  solid_dark: "bg-gray-900",
  solid_light: "bg-white",
};

const getIcon = (hint?: string) => {
  if (!hint) return null;
  const name = hint
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const Icon = (LucideIcons as any)[name];
  return Icon || null;
};

export function parseCarouselContent(content: string): CarouselData | null {
  try {
    // Try direct parse
    const parsed = JSON.parse(content.trim());
    if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
    return null;
  } catch {
    // Try extracting JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1].trim());
        if (parsed.slides && Array.isArray(parsed.slides)) return parsed;
      } catch {}
    }
    // Try finding JSON object in text
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

export default function CarouselSlidePreview({ data }: { data: CarouselData }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [copiedCaption, setCopiedCaption] = useState(false);
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

  return (
    <div className="space-y-4">
      {/* Slide viewer */}
      <div className="relative mx-auto" style={{ maxWidth: 400 }}>
        {/* Slide */}
        <div
          className={cn(
            "aspect-square rounded-2xl flex flex-col items-center justify-center p-8 text-center relative overflow-hidden transition-all duration-300",
            bgClass
          )}
        >
          {/* Decorative elements */}
          {slide.type === "cover" && (
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-6 right-6 w-32 h-32 rounded-full border-2 border-current" />
              <div className="absolute bottom-10 left-8 w-20 h-20 rounded-full border border-current" />
            </div>
          )}

          {/* Slide number badge */}
          <div className={cn("absolute top-4 left-4 text-xs font-bold px-2 py-1 rounded-full", isLight ? "bg-gray-200 text-gray-600" : "bg-white/20 text-white/70")}>
            {currentSlide + 1}/{data.slides.length}
          </div>

          {/* Icon */}
          {IconComponent && (
            <div className={cn("mb-4", accentColor)}>
              <IconComponent className="h-10 w-10" />
            </div>
          )}

          {/* Type label for cover/cta */}
          {slide.type === "cover" && (
            <span className={cn("text-xs font-bold uppercase tracking-[0.2em] mb-3", accentColor)}>
              Skill Studio AI
            </span>
          )}

          {/* Accent text */}
          {slide.accent_text && (
            <p className={cn("text-sm font-bold mb-2 tracking-wide uppercase", accentColor)}>
              {slide.accent_text}
            </p>
          )}

          {/* Headline */}
          <h2 className={cn(
            "font-black leading-tight mb-3",
            textColor,
            slide.type === "cover" ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"
          )}>
            {slide.headline}
          </h2>

          {/* Body */}
          {slide.body && (
            <p className={cn("text-sm leading-relaxed max-w-xs", subTextColor)}>
              {slide.body}
            </p>
          )}

          {/* CTA visual */}
          {slide.type === "cta" && (
            <div className={cn("mt-4 px-6 py-2.5 rounded-full font-bold text-sm", isLight ? "bg-blue-600 text-white" : "bg-white text-gray-900")}>
              Learn More →
            </div>
          )}

          {/* Swipe dots */}
          <div className="absolute bottom-4 flex gap-1.5">
            {data.slides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  i === currentSlide
                    ? (isLight ? "bg-gray-900 w-4" : "bg-white w-4")
                    : (isLight ? "bg-gray-400" : "bg-white/40")
                )}
              />
            ))}
          </div>
        </div>

        {/* Navigation arrows */}
        {currentSlide > 0 && (
          <button
            onClick={() => setCurrentSlide((p) => p - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur rounded-full p-1.5 shadow-lg hover:bg-background transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
        )}
        {currentSlide < data.slides.length - 1 && (
          <button
            onClick={() => setCurrentSlide((p) => p + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur rounded-full p-1.5 shadow-lg hover:bg-background transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto pb-2 px-1">
        {data.slides.map((s, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i)}
            className={cn(
              "flex-shrink-0 w-16 h-16 rounded-lg flex items-center justify-center text-[9px] font-bold text-center p-1.5 transition-all border-2",
              bgStyles[s.bg_style || "gradient_dark"] || bgStyles.gradient_dark,
              s.bg_style === "solid_light" ? "text-gray-900" : "text-white",
              i === currentSlide ? "border-primary ring-2 ring-primary/30 scale-105" : "border-transparent opacity-70 hover:opacity-100"
            )}
          >
            {s.headline.split(" ").slice(0, 3).join(" ")}
          </button>
        ))}
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
