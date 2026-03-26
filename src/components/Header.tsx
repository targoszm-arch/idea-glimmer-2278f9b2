import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu, X, PenSquare, Lightbulb, Library, Settings, Share2,
  LogOut, Coins, HelpCircle, ExternalLink, UserCircle,
  CalendarDays, ChevronDown, BarChart2, FileText, Video
} from "lucide-react";
import contentLabLogo from "@/assets/ContentLab_Logo.png";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useCredits, CREDIT_COSTS, STRIPE_URLS } from "@/hooks/use-credits";
import UpgradeModal from "@/components/UpgradeModal";
import TopUpModal from "@/components/TopUpModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const NAV_GROUPS = [
  {
    label: "Create",
    items: [
      { label: "Library",  href: "/dashboard", icon: Library,      desc: "Your article library" },
      { label: "Media",    href: "/brand",      icon: Video,        desc: "Brand assets & media" },
      { label: "Social",   href: "/social",     icon: Share2,       desc: "Social post ideas" },
      { label: "Ideas",    href: "/ideas",       icon: Lightbulb,   desc: "Content idea bank" },
    ],
  },
  {
    label: "Publish",
    items: [
      { label: "Post",     href: "/new",         icon: PenSquare,   desc: "Write a new article" },
      { label: "Schedule", href: "/calendar",    icon: CalendarDays,desc: "Calendar & automations" },
    ],
  },
  {
    label: "Monitor",
    items: [
      { label: "Analytics", href: "/analytics",  icon: BarChart2,   desc: "Content performance" },
      { label: "Reports",   href: "/reports",    icon: FileText,    desc: "Detailed reports" },
    ],
  },
];

// Exact match hrefs per group — used to avoid false positives
const GROUP_HREFS: Record<string, string[]> = {
  Create:  ["/dashboard", "/brand", "/social", "/ideas"],
  Publish: ["/new", "/calendar", "/automations"],
  Monitor: ["/analytics", "/reports"],
};

function NavDropdown({ group }: { group: typeof NAV_GROUPS[number] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const groupHrefs = GROUP_HREFS[group.label] ?? [];
  const isGroupActive = groupHrefs.includes(location.pathname);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-all outline-none
          ${isGroupActive ? "text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
      >
        {group.label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 top-full mt-1.5 w-52 rounded-xl border border-border bg-white shadow-lg z-50 overflow-hidden"
          >
            <div className="py-1.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.label}
                    to={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 text-sm transition-colors
                      ${isActive ? "bg-primary/5 text-primary" : "text-foreground hover:bg-muted/60"}`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className="font-medium leading-tight">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground leading-tight">{item.desc}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const location = useLocation();
  const { signOut } = useAuth();
  const { credits, loading: creditsLoading, isPaidPlan } = useCredits();
  const isSettingsActive = location.pathname.startsWith("/settings") || location.pathname === "/brand";

  return (
    <>
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} />
      <TopUpModal open={showTopUp} onClose={() => setShowTopUp(false)} />
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 w-full sticky top-0 z-40">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 flex h-14 items-center gap-3">

          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 font-bold text-foreground shrink-0">
            <img src={contentLabLogo} alt="ContentLab" className="h-8 w-auto" />
            <span className="hidden lg:inline text-sm">ContentLab</span>
          </Link>

          {/* Compose button */}
          <Link to="/new"
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors shrink-0">
            <PenSquare className="h-3.5 w-3.5" />
            Compose
          </Link>

          {/* Dropdown groups */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
            {NAV_GROUPS.map(group => (
              <NavDropdown key={group.label} group={group} />
            ))}
          </nav>

          {/* Right side — Credits | Help | Settings | Profile | Logout */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">

            {/* Credits pill */}
            <span
              onClick={() => { if ((credits ?? 0) === 0) { isPaidPlan ? setShowTopUp(true) : setShowUpgrade(true); } }}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold cursor-pointer ${
                (credits ?? 1) === 0 ? "bg-red-100 text-red-700 animate-pulse" : "bg-accent text-accent-foreground"
              }`}>
              <Coins className="h-3.5 w-3.5 text-primary" />
              {creditsLoading ? "…" : credits ?? 0}
            </span>

            {/* Help / credits popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <HelpCircle className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-sm" align="end">
                <h4 className="font-semibold text-foreground mb-2">How Credits Work</h4>
                <p className="text-muted-foreground mb-3 text-xs">Credits are deducted each time you generate AI content.</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Article generation", cost: CREDIT_COSTS.generate_article },
                    { label: "Cover image",         cost: CREDIT_COSTS.generate_cover_image },
                    { label: "Infographic",         cost: CREDIT_COSTS.generate_infographic },
                    { label: "Social post",         cost: CREDIT_COSTS.generate_social_post },
                    { label: "Content ideas",       cost: CREDIT_COSTS.generate_ideas },
                    { label: "Reel video",          cost: CREDIT_COSTS.generate_reel_video },
                    { label: "HeyGen video",        cost: CREDIT_COSTS.heygen_video },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium text-foreground">{item.cost} cr</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-2">
                  {isPaidPlan ? (
                    <a href={STRIPE_URLS.topUp25} target="_blank" rel="noreferrer"
                      className="block w-full text-center bg-primary text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-primary/90">
                      ⚡ Top Up Credits
                    </a>
                  ) : (
                    <a href={STRIPE_URLS.upgrade} target="_blank" rel="noreferrer"
                      className="block w-full text-center bg-primary text-white rounded-lg py-1.5 text-xs font-semibold hover:bg-primary/90">
                      ⚡ Upgrade Plan
                    </a>
                  )}
                  <button onClick={() => window.open(STRIPE_URLS.customerPortal, "_blank")}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline text-xs">
                    <ExternalLink className="h-3 w-3" /> Manage Billing
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Settings */}
            <Link to="/settings"
              className={`rounded-lg p-1.5 transition-colors ${isSettingsActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
              title="Settings">
              <Settings className="h-4 w-4" />
            </Link>

            {/* Profile */}
            <Link to="/profile"
              className="hidden md:block rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="My Profile">
              <UserCircle className="h-4 w-4" />
            </Link>

            {/* Logout */}
            <button onClick={() => signOut()}
              className="hidden md:block rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>

            {/* Mobile burger */}
            <button className="md:hidden rounded-lg p-2 text-muted-foreground hover:bg-secondary"
              onClick={() => setMobileOpen(v => !v)}>
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
              className="overflow-hidden border-t border-border md:hidden w-full bg-background"
            >
              <nav className="w-full px-4 py-3 flex flex-col gap-0.5">
                <Link to="/new" onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold bg-primary text-white mb-2">
                  <PenSquare className="h-4 w-4" /> Compose
                </Link>
                {NAV_GROUPS.map(group => (
                  <div key={group.label}>
                    <button
                      onClick={() => setMobileExpanded(v => v === group.label ? null : group.label)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg"
                    >
                      {group.label}
                      <ChevronDown className={`h-4 w-4 transition-transform ${mobileExpanded === group.label ? "rotate-180" : ""}`} />
                    </button>
                    {mobileExpanded === group.label && (
                      <div className="ml-3 border-l border-border pl-3 mb-1">
                        {group.items.map(item => {
                          const Icon = item.icon;
                          const isActive = location.pathname === item.href;
                          return (
                            <Link key={item.label} to={item.href}
                              onClick={() => setMobileOpen(false)}
                              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors
                                ${isActive ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}>
                              <Icon className="h-4 w-4" /> {item.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <div className="border-t border-border mt-2 pt-2 flex items-center gap-1">
                  <Link to="/settings" onClick={() => setMobileOpen(false)}
                    className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-secondary">
                    <Settings className="h-4 w-4" /> Settings
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
    </>
  );
};

export default Header;
