import { motion } from "framer-motion";
import { featuredArticle, featuredPosts } from "@/data/articles";
import heroImage from "@/assets/hero-featured.jpg";

const HeroSection = () => {
  return (
    <section className="container py-8 lg:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        {/* Featured Article */}
        <a href="/article/featured">
        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="group cursor-pointer"
        >
          <div className="overflow-hidden rounded-xl">
            <motion.img
              src={heroImage}
              alt={featuredArticle.title}
              className="w-full aspect-[16/9] object-cover"
              whileHover={{ scale: 1.03 }}
              transition={{ duration: 0.4 }}
            />
          </div>
          <div className="mt-5 space-y-3">
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold leading-tight text-foreground group-hover:text-primary transition-colors">
              {featuredArticle.title}
            </h1>
            <p className="text-muted-foreground text-base max-w-2xl">
              {featuredArticle.excerpt}
            </p>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{featuredArticle.author}</span>
              <span>{featuredArticle.date}</span>
            </div>
          </div>
        </motion.article>
        </a>

        {/* Featured Posts Sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="hidden lg:block"
        >
          <h2 className="text-lg font-bold text-foreground pb-3 border-b border-foreground">
            Featured Posts
          </h2>
          <ul className="divide-y divide-border">
            {featuredPosts.map((post) => (
              <li key={post.id} className="py-4 group cursor-pointer">
                <a href={`/article/${post.id}`} className="block">
                  <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{post.author}</span>
                    <span>{post.date}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </motion.aside>
      </div>
    </section>
  );
};

export default HeroSection;
