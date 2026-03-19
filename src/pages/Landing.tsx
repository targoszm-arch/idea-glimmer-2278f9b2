import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { PenSquare, Share2, Video, BarChart3, Zap, ArrowRight, Check } from "lucide-react";
import { motion } from "framer-motion";

const features = [
  { icon: PenSquare, title: "AI Article Generation", desc: "Generate SEO-optimised articles with your brand voice and tone in seconds." },
  { icon: Share2, title: "Social Media Posts", desc: "Create platform-specific social content for LinkedIn, Twitter, Instagram & more." },
  { icon: Video, title: "HeyGen Video", desc: "Turn articles into engaging AI avatar videos with a single click." },
  { icon: BarChart3, title: "Infographics", desc: "Auto-generate carousel infographics from your content for visual storytelling." },
];

const Landing = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <span className="text-xl font-bold tracking-tight">
            Skill Studio AI <span className="text-primary">ContentLab</span>
          </span>
          <div className="flex items-center gap-3">
            <Link to="/login" className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link to="/signup" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 md:py-32 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            AI-Powered Content Creation for{" "}
            <span className="text-primary">Your Brand</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Generate articles, social posts, videos and infographics — all tuned to your brand voice. From idea to published content in minutes, not hours.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link to="/signup" className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
              Get Started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-base font-medium text-foreground hover:bg-secondary transition-colors">
              Sign In
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-secondary/30 py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">Everything you need to create content</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
            One platform, every format. Powered by AI, shaped by your brand.
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl border border-border bg-card p-6"
              >
                <div className="mb-4 inline-flex rounded-lg bg-primary/10 p-3">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-card-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-center text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-muted-foreground">
            Start with a plan, top up when you need more.
          </p>

          <div className="mt-14 grid gap-8 sm:grid-cols-3 mx-auto max-w-4xl">
            {/* Main Plan */}
            <div className="sm:col-span-3 lg:col-span-1 rounded-xl border-2 border-primary bg-card p-8 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                Most Popular
              </div>
              <h3 className="text-xl font-bold text-card-foreground">Starter Plan</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">€49</span>
                <span className="text-muted-foreground">/one-time</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">200 credits included</p>
              <ul className="mt-6 space-y-3">
                {["200 AI credits", "Article generation", "Social media posts", "HeyGen video", "Infographic carousel", "Brand voice settings"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-card-foreground">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="mt-8 block w-full rounded-lg bg-primary py-3 text-center text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
                Get Started
              </Link>
            </div>

            {/* Top-up 100 */}
            <div className="rounded-xl border border-border bg-card p-8">
              <h3 className="text-xl font-bold text-card-foreground">Top Up</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">€25</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">100 credits</p>
              <ul className="mt-6 space-y-3">
                {["100 AI credits", "No expiry", "Instant activation"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-card-foreground">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a href="https://buy.stripe.com/7sY3cv9XBgmHcNKdZh7EQ0g" target="_blank" rel="noopener noreferrer" className="mt-8 block w-full rounded-lg border border-border py-3 text-center text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
                Buy 100 Credits
              </a>
            </div>

            {/* Top-up 200 */}
            <div className="rounded-xl border border-border bg-card p-8">
              <h3 className="text-xl font-bold text-card-foreground">Top Up</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">€50</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">200 credits</p>
              <ul className="mt-6 space-y-3">
                {["200 AI credits", "No expiry", "Best value"].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-card-foreground">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a href="https://buy.stripe.com/fZu7sL2v92vR1526wP7EQ0h" target="_blank" rel="noopener noreferrer" className="mt-8 block w-full rounded-lg border border-border py-3 text-center text-sm font-semibold text-foreground hover:bg-secondary transition-colors">
                Buy 200 Credits
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Skill Studio AI ContentLab. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
