import { motion } from "framer-motion";
import type { Article } from "@/data/articles";
import { Skeleton } from "@/components/ui/skeleton";
import article1 from "@/assets/article-1.jpg";
import article2 from "@/assets/article-2.jpg";
import article3 from "@/assets/article-3.jpg";
import article4 from "@/assets/article-4.jpg";

const fallbackImages = [article1, article2, article3, article4];

interface Props {
  articles: Article[];
  isLoading: boolean;
}

const ContentGrid = ({ articles, isLoading }: Props) => {
  if (isLoading) {
    return (
      <section className="container py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="w-full aspect-square rounded-xl" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="container py-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {articles.map((article, i) => (
          <motion.article
            key={article.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ y: -4, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group cursor-pointer"
          >
            <a
              href={article.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="overflow-hidden rounded-xl">
                <img
                  src={article.image ?? fallbackImages[i % fallbackImages.length]}
                  alt={article.title}
                  className="w-full aspect-square object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </div>
              <div className="mt-3 space-y-2">
                <h3 className="text-sm font-bold leading-snug text-foreground group-hover:text-primary transition-colors line-clamp-2">
                  {article.title}
                </h3>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {article.excerpt}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span className="font-medium">{article.author}</span>
                  <span>{article.date}</span>
                </div>
              </div>
            </a>
          </motion.article>
        ))}
      </div>
    </section>
  );
};

export default ContentGrid;
