import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, PenSquare, Lightbulb, Library, Settings, Share2, Palette, LogOut, Coins, HelpCircle, ExternalLink, Plug, UserCircle } from "lucide-react";
import contentLabLogo from "@/assets/ContentLab_Logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, CREDIT_COSTS, STRIPE_URLS, TOP_UP_OPTIONS } from "@/hooks/use-credits";
import UpgradeModal from "@/components/UpgradeModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState } from "react";

const navItems = [
  { label: "Library", href: "/dashboard", icon: Library },
  { label: "New Article", href: "/new", icon: PenSquare },
  { label: "Ideas", href: "/ideas", icon: Lightbulb },
  { label: "Social", href: "/social", icon: Share2 },
  { label: "Brand", href: "/brand", icon: Palette },
  { label: "Settings", href: "/settings", icon: Settings },
  { label: "Integrations", href: "/settings/integrations", icon: Plug },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();
  const { credits, loading: creditsLoading } = useCredits();

  return (
    <>
    <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center justify-between gap-4">

        {/* Logo */}
        <Link to="/dashboard" className="flex items-center gap-2 font-bold text-foreground shrink-0">
          <img src={contentLabLogo} alt="ContentLab" className="h-8 w-auto" />
          <span className="hidden lg:inline text-sm">ContentLab</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link key={item.label} to={item.href}
                className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Credits */}
          <div className="flex items-center gap-1">
            <span onClick={() => { if ((credits ?? 0) === 0) setShowUpgrade(true); }} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold cursor-pointer ${(credits ?? 1) === 0 ? "bg-red-100 text-red-700 animate-pulse" : "bg-accent text-accent-foreground"}`}>
              <Coins className="h-3.5 w-3.5 text-primary" />
              {creditsLoading ? "…" : credits ?? 0}
            </span>
            <Popover>
              <PopoverTrigger asChild>
                <button className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-sm" align="end">
                <h4 className="font-semibold text-foreground mb-2">How Credits Work</h4>
                <p className="text-muted-foreground mb-3 text-xs">Credits are deducted each time you generate AI content.</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Article generation", cost: CREDIT_COSTS.generate_article },
                    { label: "Cover image", cost: CREDIT_COSTS.generate_cover_image },
                    { label: "Infographic", cost: CREDIT_COSTS.generate_infographic },
                    { label: "Social post", cost: CREDIT_COSTS.generate_social_post },
                    { label: "Content ideas", cost: CREDIT_COSTS.generate_ideas },
                    { label: "Reel video", cost: CREDIT_COSTS.generate_reel_video },
                    { label: "HeyGen video", cost: CREDIT_COSTS.heygen_video },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.cost} cr</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  <button onClick={() => setShowUpgrade(true)} className="block w-full text-center bg-primary text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-primary/90">
                    ⚡ Get More Credits
                  </button>
                  <button onClick={() => window.open(STRIPE_URLS.customerPortal, "_blank")} className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline text-xs">
                    <ExternalLink className="h-3 w-3" /> Manage Billing
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Create button - desktop only */}
          <Link to="/new"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
            <PenSquare className="h-3.5 w-3.5" />
            Create
          </Link>

          {/* Profile + logout - desktop */}
          <div className="hidden md:flex items-center gap-1">
            <Link to="/profile" className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="My Profile">
              <UserCircle className="h-4 w-4" />
            </Link>
            <button onClick={() => signOut()} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile burger */}
          <button className="md:hidden rounded-lg p-2 text-muted-foreground hover:bg-secondary" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-border md:hidden w-full"
          >
            <nav className="w-full px-4 py-3 flex flex-col gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link key={item.label} to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-border mt-1 pt-1 flex items-center gap-1">
                <Link to="/new" onClick={() => setMobileOpen(false)}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-white">
                  <PenSquare className="h-4 w-4" /> Create
                </Link>
                <Link to="/profile" onClick={() => setMobileOpen(false)}
                  className="rounded-lg p-2.5 text-muted-foreground hover:bg-secondary">
                  <UserCircle className="h-4 w-4" />
                </Link>
                <button onClick={() => { signOut(); setMobileOpen(false); }}
                  className="rounded-lg p-2.5 text-muted-foreground hover:bg-secondary">
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
    </>
  );
};

export default Header;
