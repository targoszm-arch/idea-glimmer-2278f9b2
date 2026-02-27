import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewsletterSection from "@/components/NewsletterSection";
import article1 from "@/assets/article-1.jpg";
import article2 from "@/assets/article-2.jpg";
import article3 from "@/assets/article-3.jpg";
import article4 from "@/assets/article-4.jpg";
import heroImage from "@/assets/hero-featured.jpg";
import { Link } from "react-router-dom";

const blogPosts = [
  { id: "1", title: "How to Build a Content Strategy That Actually Drives Revenue", excerpt: "Most content strategies fail because they focus on vanity metrics. Here's a framework that ties every piece of content to pipeline generation.", author: "Jessica Martinez", date: "2/20/26", category: "Marketing Strategy", image: heroImage },
  { id: "2", title: "The Rise of Account-Based Content Marketing", excerpt: "ABM isn't just for ads and sales outreach anymore. Learn how top B2B companies are creating hyper-personalized content experiences.", author: "Marcus Chen", date: "2/18/26", category: "Sales Enablement", image: article1 },
  { id: "3", title: "Why Your Blog Needs a Video Component in 2026", excerpt: "Written content alone won't cut it. Discover how embedded video increases time on page by 88% and boosts conversion rates.", author: "Priya Sharma", date: "2/15/26", category: "Product Management", image: article2 },
  { id: "4", title: "Content Repurposing: Turn One Piece Into Twenty", excerpt: "Stop creating from scratch every time. This systematic approach to repurposing will 10x your content output without burning out your team.", author: "Amy Porterfield", date: "2/12/26", category: "Marketing Strategy", image: article3 },
  { id: "5", title: "The Psychology Behind High-Converting Landing Pages", excerpt: "From cognitive load theory to the mere exposure effect, these psychological principles will transform your landing page performance.", author: "Daniel Park", date: "2/10/26", category: "Customer Success", image: article4 },
  { id: "6", title: "SEO in the Age of AI: What Still Works", excerpt: "Google's AI overviews are changing search. Here's what content marketers need to know to stay visible and drive organic traffic.", author: "Sonia Thompson", date: "2/8/26", category: "Marketing Strategy", image: article1 },
  { id: "7", title: "Building Trust Through Transparent Content", excerpt: "Consumers are tired of corporate speak. Brands that embrace radical transparency in their content are winning customer loyalty.", author: "Jay Fuchs", date: "2/5/26", category: "Customer Success", image: article2 },
  { id: "8", title: "Data-Driven Content: From Analytics to Action", excerpt: "You're sitting on a goldmine of content performance data. Here's how to turn those numbers into a smarter editorial calendar.", author: "Caroline Forsey", date: "2/3/26", category: "Product Management", image: article3 },
  { id: "9", title: "The Complete Guide to Thought Leadership Content", excerpt: "Thought leadership isn't about self-promotion. Learn how to create content that genuinely advances your industry's conversation.", author: "Rebecca Riserbato", date: "1/30/26", category: "Marketing Strategy", image: article4 },
];

const Blog = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="container py-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl md:text-4xl font-bold text-foreground">Blog</h1>
            <p className="mt-2 text-muted-foreground max-w-2xl">Insights, strategies, and deep dives from the Content Hub team and guest contributors.</p>
          </motion.div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {blogPosts.map((post, i) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -4, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group"
              >
                <Link to={`/article/${post.id}`} className="block">
                  <div className="overflow-hidden rounded-xl">
                    <img src={post.image} alt={post.title} className="w-full aspect-[16/10] object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  </div>
                  <div className="mt-3 space-y-2">
                    <span className="text-xs font-semibold text-primary">{post.category}</span>
                    <h2 className="text-base font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">{post.title}</h2>
                    <p className="text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <span className="font-medium">{post.author}</span>
                      <span>{post.date}</span>
                    </div>
                  </div>
                </Link>
              </motion.article>
            ))}
          </div>
        </section>
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Blog;
