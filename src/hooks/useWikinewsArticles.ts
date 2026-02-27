import { useQuery } from "@tanstack/react-query";
import { fetchLatestArticles } from "@/lib/api/wikinews";
import type { Article } from "@/data/articles";

export function useWikinewsArticles() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["wikinews-articles"],
    queryFn: () => fetchLatestArticles(15),
    staleTime: 5 * 60 * 1000,
  });

  const articles = data ?? [];

  const featuredArticle: Article | null = articles[0] ?? null;
  const featuredPosts: Article[] = articles.slice(1, 6);
  const gridArticles: Article[] = articles.slice(6, 10);

  return { featuredArticle, featuredPosts, gridArticles, isLoading, error };
}
