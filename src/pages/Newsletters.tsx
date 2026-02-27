import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, Users, Calendar, Zap, TrendingUp, Target } from "lucide-react";

const newsletters = [
  { name: "The Growth Loop", description: "Weekly deep-dive into growth marketing tactics, A/B test results, and funnel optimization strategies from real campaigns.", frequency: "Every Monday", subscribers: "25,400+", icon: TrendingUp },
  { name: "RevOps Roundup", description: "Bi-weekly digest covering revenue operations, CRM workflows, and the tech stack powering modern sales teams.", frequency: "Every other Wednesday", subscribers: "18,200+", icon: Target },
  { name: "Content Catalyst", description: "Fresh content marketing ideas, SEO updates, and creator economy trends delivered to your inbox every Thursday.", frequency: "Every Thursday", subscribers: "31,700+", icon: Zap },
  { name: "The CX Brief", description: "Customer success stories, retention strategies, and NPS benchmarks from leading SaaS companies.", frequency: "Every Friday", subscribers: "12,900+", icon: Users },
];

const pastIssues = [
  { title: "Why Your Onboarding Flow Is Killing Retention", newsletter: "The CX Brief", date: "Feb 21, 2026" },
  { title: "5 A/B Tests That Doubled Our Signup Rate", newsletter: "The Growth Loop", date: "Feb 17, 2026" },
  { title: "The HubSpot-Salesforce Migration Playbook", newsletter: "RevOps Roundup", date: "Feb 12, 2026" },
  { title: "AI-Generated Content: Quality vs. Quantity", newsletter: "Content Catalyst", date: "Feb 6, 2026" },
  { title: "How We Reduced Churn by 40% in 90 Days", newsletter: "The CX Brief", date: "Feb 7, 2026" },
  { title: "The Death of Third-Party Cookies: What Now?", newsletter: "The Growth Loop", date: "Feb 10, 2026" },
];

const Newsletters = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="bg-primary text-primary-foreground py-16">
          <div className="container">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-2xl text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-foreground/20">
                  <Mail className="h-7 w-7" />
                </div>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold">Our Newsletters</h1>
              <p className="mt-3 text-primary-foreground/80 text-lg">Curated insights delivered straight to your inbox. Choose the topics that matter to you.</p>
            </motion.div>
          </div>
        </section>

        <section className="container py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {newsletters.map((nl, i) => {
              const Icon = nl.icon;
              return (
                <motion.div
                  key={nl.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="rounded-xl border border-border bg-card p-6 space-y-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{nl.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{nl.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{nl.frequency}</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{nl.subscribers} subscribers</span>
                  </div>
                  <button className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95">
                    Subscribe
                  </button>
                </motion.div>
              );
            })}
          </div>
        </section>

        <section className="container pb-12">
          <h2 className="text-2xl font-bold text-foreground mb-6">Recent Issues</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {pastIssues.map((issue, i) => (
              <motion.a
                key={i}
                href="#"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-secondary/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{issue.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{issue.newsletter}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{issue.date}</span>
              </motion.a>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Newsletters;
