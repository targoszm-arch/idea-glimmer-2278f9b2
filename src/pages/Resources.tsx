import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewsletterSection from "@/components/NewsletterSection";
import { FileText, Download, BookOpen, BarChart3, Layout, Video } from "lucide-react";

const resources = [
  { title: "The Complete RevOps Playbook", type: "eBook", description: "A 75-page guide covering everything from pipeline management to cross-functional alignment. Includes real case studies from Stripe, HubSpot, and Notion.", downloads: "8,450+", icon: BookOpen },
  { title: "Marketing Strategy Templates Bundle", type: "Templates", description: "12 ready-to-use templates for content calendars, campaign briefs, buyer personas, and competitive analysis. Compatible with Google Sheets and Notion.", downloads: "12,300+", icon: Layout },
  { title: "2026 State of Content Marketing Report", type: "Report", description: "Data from 2,500+ marketers on budgets, AI adoption, channel performance, and emerging trends. 48 pages of charts and actionable insights.", downloads: "6,800+", icon: BarChart3 },
  { title: "SEO Audit Checklist", type: "Checklist", description: "A comprehensive 50-point checklist for technical SEO, on-page optimization, and content quality. Used by agencies managing 100+ client sites.", downloads: "15,200+", icon: FileText },
  { title: "Content Repurposing Masterclass", type: "Video Course", description: "6-part video series showing how to turn a single blog post into 20+ pieces of content across platforms. Includes Canva and Descript workflows.", downloads: "4,100+", icon: Video },
  { title: "Customer Journey Mapping Kit", type: "Templates", description: "Miro and FigJam templates for mapping B2B customer journeys. Includes touchpoint analysis, emotion tracking, and opportunity identification.", downloads: "9,700+", icon: Layout },
];

const Resources = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="container py-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Resources</h1>
            <p className="mt-2 text-muted-foreground max-w-2xl">Free templates, guides, reports, and tools to level up your marketing, sales, and customer success operations.</p>
          </motion.div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resources.map((resource, i) => {
              const Icon = resource.icon;
              return (
                <motion.div
                  key={resource.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  whileHover={{ y: -4 }}
                  className="rounded-xl border-2 border-primary/30 bg-card p-6 space-y-4 flex flex-col"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full">{resource.type}</span>
                  </div>
                  <h2 className="text-lg font-bold text-foreground">{resource.title}</h2>
                  <p className="text-sm text-muted-foreground flex-1">{resource.description}</p>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Download className="h-3.5 w-3.5" />{resource.downloads} downloads</span>
                    <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
                      Get Free
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Resources;
