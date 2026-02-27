import { useParams, Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewsletterSection from "@/components/NewsletterSection";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import heroImage from "@/assets/hero-featured.jpg";

const articleContent = {
  "featured": {
    title: "The future of marketing isn't humans vs. AI — it's humans with AI",
    author: "Jessica Martinez",
    role: "VP of Marketing, Content Hub",
    date: "February 15, 2026",
    readTime: "12 min read",
    category: "Marketing Strategy",
    image: heroImage,
    body: [
      "The conversation around AI in marketing has been dominated by fear. Will AI replace marketers? Will content lose its soul? Will algorithms decide everything we create? After spending two years integrating AI into our marketing operations at Content Hub, I can tell you the answer is a resounding no.",
      "But here's the thing — the real story is far more interesting than a simple binary. The future of marketing isn't about choosing between human creativity and machine efficiency. It's about combining them in ways that neither could achieve alone.",
      "## The Loop Playbook",
      "We call our framework 'The Loop' because it's designed to be cyclical. AI generates ideas and drafts. Humans refine, add nuance, and inject brand voice. AI then optimizes distribution and measures performance. Humans interpret the data and set new creative direction. Round and round we go, each cycle producing better results than the last.",
      "When we first implemented The Loop, our content output increased by 3x. But more importantly, our engagement metrics improved across the board. Average time on page went up 23%. Social shares increased by 47%. And our lead generation from content marketing grew by 61%.",
      "## Where AI Excels",
      "Let's be honest about what AI does exceptionally well. It's brilliant at pattern recognition — identifying which topics are trending, which headlines perform best, which content formats resonate with specific audience segments. It can analyze thousands of data points in seconds and surface insights that would take a human analyst weeks to uncover.",
      "AI is also remarkable at handling the repetitive, time-consuming tasks that eat into creative time. Meta descriptions, social media copy variations, email subject line testing, image alt text — these are all areas where AI can save hours of manual work every week.",
      "## Where Humans Are Irreplaceable",
      "But AI falls flat in some critical areas. It can't truly understand the emotional weight of a customer's pain point. It can't build genuine relationships with sources and industry experts. It can't make the intuitive creative leaps that produce truly breakthrough campaigns.",
      "Most importantly, AI can't understand context the way humans can. It doesn't know that your CEO just gave a keynote that shifted the company's positioning. It doesn't understand that a competitor's recent controversy creates an opportunity for thoughtful commentary. It can't read the room.",
      "## Getting Started",
      "If you're looking to implement a similar approach, start small. Pick one area of your content workflow — maybe it's research, maybe it's repurposing, maybe it's analytics — and introduce AI there. Let your team get comfortable with the technology before expanding.",
      "The most successful AI integrations we've seen aren't the ones that try to automate everything overnight. They're the ones that thoughtfully augment human capabilities, one workflow at a time.",
      "The future belongs to marketing teams that learn to dance with AI — not fight it, not surrender to it, but truly partner with it. And that future is already here.",
    ],
  },
};

const Article = () => {
  const { id } = useParams();
  const article = articleContent[id as keyof typeof articleContent] || articleContent["featured"];
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="min-h-screen bg-background">
      <motion.div className="fixed top-0 left-0 right-0 h-1 bg-primary z-[60] origin-left" style={{ scaleX }} />
      <Header />
      <main>
        <article className="container max-w-3xl mx-auto py-10 px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>

            <span className="text-sm font-semibold text-primary">{article.category}</span>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold text-foreground leading-tight">{article.title}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">{article.author}</span>
                <span className="block text-xs">{article.role}</span>
              </div>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{article.date}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{article.readTime}</span>
            </div>

            <div className="mt-8 overflow-hidden rounded-xl">
              <img src={article.image} alt={article.title} className="w-full aspect-[16/9] object-cover" />
            </div>

            <div className="mt-10 space-y-5">
              {article.body.map((paragraph, i) => {
                if (paragraph.startsWith("## ")) {
                  return <h2 key={i} className="text-2xl font-bold text-foreground pt-4">{paragraph.replace("## ", "")}</h2>;
                }
                return <p key={i} className="text-lg leading-relaxed text-foreground/90">{paragraph}</p>;
              })}
            </div>

            {/* Inline CTA */}
            <div className="mt-12 rounded-xl bg-primary/10 border-2 border-primary/30 p-6 text-center">
              <h3 className="text-lg font-bold text-foreground">Want more insights like this?</h3>
              <p className="mt-1 text-sm text-muted-foreground">Join 25,000+ marketers getting weekly strategy breakdowns.</p>
              <Link to="/#newsletter" className="mt-4 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
                Subscribe Free
              </Link>
            </div>
          </motion.div>
        </article>
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Article;
