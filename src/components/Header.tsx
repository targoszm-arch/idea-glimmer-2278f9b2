import { useState } from "react";
import { Search, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const navItems = [
  { label: "Blog", href: "/blog" },
  { label: "Newsletters", href: "/newsletters" },
  { label: "Resources", href: "/resources" },
  { label: "Podcasts", href: "/podcasts" },
];

const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/" className="text-xl font-bold tracking-tight text-foreground">
            Content<span className="text-primary">Hub</span>
          </a>
          <nav className="hidden md:flex items-center gap-6">
           {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Search className="h-5 w-5" />
          </button>
          <a
            href="#newsletter"
            className="hidden sm:inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95"
          >
            Subscribe
          </a>
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
            <nav className="container flex flex-col gap-3 py-4">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
