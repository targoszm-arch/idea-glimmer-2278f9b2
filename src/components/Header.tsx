import { Key, useState } from "react";
import { Key, Menu, X, PenSquare, Lightbulb, Library, Settings, Share2, Palette, LogOut, Coins, HelpCircle, ExternalLink, Plug } from "lucide-react";
import contentLabLogo from "@/assets/ContentLab_Logo.png";
import { Key, motion, AnimatePresence } from "framer-motion";
import { Key, Link, useLocation } from "react-router-dom";
import { Key, useAuth } from "@/contexts/AuthContext";
import { Key, useCredits, CREDIT_COSTS, STRIPE_URLS } from "@/hooks/use-credits";
import { Key, Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const navItems = [
  { label: "Library", href: "/dashboard", icon: Library },
  { label: "New Article", href: "/new", icon: PenSquare },
  { label: "Ideas", href: "/ideas", icon: Lightbulb },
  { label: "Social", href: "/social", icon: Share2 },
  { label: "Brand", href: "/brand", icon: Palette },
  { label: "AI Settings", href: "/settings", icon: Settings },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
  { label: "API Key", href: "/settings/api-key", icon: Key },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();
  const { credits, loading: creditsLoading } = useCredits();

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link to="/dashboard" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
            <img src={contentLabLogo} alt="ContentLab Logo" className="h-10 w-auto" />
            Skill Studio AI <span className="text-primary">ContentLab</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* Credits badge + help */}
          <div className="inline-flex items-center gap-1">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
            >
              <Coins className="h-4 w-4 text-primary" />
              {creditsLoading ? "…" : credits ?? 0}
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <button className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="How credits work">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-sm" align="end">
                <h4 className="font-semibold text-foreground mb-2">How Credits Work</h4>
                <p className="text-muted-foreground mb-3">Credits are deducted each time you generate AI content. Free plan starts with 10 credits.</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Article generation", cost: CREDIT_COSTS.generate_article },
                    { label: "Cover image", cost: CREDIT_COSTS.generate_cover_image },
                    { label: "Infographic", cost: CREDIT_COSTS.generate_infographic },
                    { label: "Social post", cost: CREDIT_COSTS.generate_social_post },
                    { label: "Content ideas", cost: CREDIT_COSTS.generate_ideas },
                    { label: "Social ideas", cost: CREDIT_COSTS.generate_social_ideas },
                    { label: "Reel video (Sora)", cost: CREDIT_COSTS.generate_reel_video },
                    { label: "HeyGen video", cost: CREDIT_COSTS.heygen_video },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.cost} cr</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  <button onClick={() => window.open(STRIPE_URLS.topUp100, "_blank")} className="block text-primary hover:underline text-xs font-medium">
                    Buy 100 credits — €25 →
                  </button>
                  <button onClick={() => window.open(STRIPE_URLS.topUp200, "_blank")} className="block text-primary hover:underline text-xs font-medium">
                    Buy 200 credits — €50 →
                  </button>
                  <button onClick={() => window.open(STRIPE_URLS.customerPortal, "_blank")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline text-xs">
                    <ExternalLink className="h-3 w-3" />
                    Manage Billing
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Link
            to="/new"
            className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            <PenSquare className="h-4 w-4" />
            Create
          </Link>
          <button
            onClick={() => signOut()}
            className="hidden sm:inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
          <button
            className="md:hidden rounded-lg p-2 text-muted-foreground hover:bg-secondary"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <nav className="container flex flex-col gap-1 py-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
