import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Headphones, Play, Clock } from "lucide-react";
import article1 from "@/assets/article-1.jpg";
import article2 from "@/assets/article-2.jpg";
import article3 from "@/assets/article-3.jpg";
import article4 from "@/assets/article-4.jpg";

const episodes = [
  { id: 1, title: "The AI Content Revolution: Hype vs. Reality", guest: "Sarah Chen, VP of Content at Jasper", duration: "42 min", date: "Feb 24, 2026", description: "Sarah shares how her team uses AI to produce 3x more content without sacrificing quality, and the guardrails they've put in place.", image: article1 },
  { id: 2, title: "Building a Media Company Inside Your SaaS", guest: "James Patterson, CMO at Drift", duration: "38 min", date: "Feb 17, 2026", description: "Why Drift invested in becoming a media brand, and how their podcast and video content drives 40% of pipeline.", image: article2 },
  { id: 3, title: "From 0 to 100K Subscribers: A Newsletter Growth Story", guest: "Lenny Rachitsky, Lenny's Newsletter", duration: "55 min", date: "Feb 10, 2026", description: "Lenny breaks down his exact growth playbook, monetization strategy, and the systems that keep his newsletter running.", image: article3 },
  { id: 4, title: "The Future of SEO After AI Overviews", guest: "Lily Ray, VP of SEO at Amsive Digital", duration: "47 min", date: "Feb 3, 2026", description: "With Google's AI reshaping search results, Lily explains what content teams need to do differently to maintain organic visibility.", image: article4 },
  { id: 5, title: "Community-Led Growth: More Than a Buzzword", guest: "Kathleen Booth, SVP of Marketing at Pavilion", duration: "36 min", date: "Jan 27, 2026", description: "Kathleen shares how Pavilion built a thriving community of 10,000+ executives and turned it into their primary growth engine.", image: article1 },
  { id: 6, title: "Content Operations at Scale: Lessons from Enterprise", guest: "Robert Rose, Chief Strategy Advisor at CMI", duration: "51 min", date: "Jan 20, 2026", description: "Robert discusses the operational frameworks that separate mature content organizations from those still stuck in ad-hoc production.", image: article2 },
];

const Podcasts = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="container py-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Headphones className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">The Content Hub Podcast</h1>
              <p className="mt-1 text-muted-foreground">Weekly conversations with the minds shaping modern marketing.</p>
            </div>
          </motion.div>

          <div className="mt-10 space-y-4">
            {episodes.map((ep, i) => (
              <motion.div
                key={ep.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -2 }}
                className="flex gap-5 rounded-xl border border-border bg-card p-4 group cursor-pointer transition-shadow hover:shadow-lg"
              >
                <div className="relative shrink-0 w-28 h-28 rounded-lg overflow-hidden">
                  <img src={ep.image} alt={ep.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="h-8 w-8 text-primary-foreground fill-current" />
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Episode {ep.id}</span>
                    <span>{ep.date}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ep.duration}</span>
                  </div>
                  <h2 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">{ep.title}</h2>
                  <p className="text-xs font-medium text-primary">{ep.guest}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{ep.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Podcasts;
