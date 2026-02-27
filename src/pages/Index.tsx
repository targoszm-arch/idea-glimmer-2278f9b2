import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import TopicClusters from "@/components/TopicClusters";
import ContentGrid from "@/components/ContentGrid";
import NewsletterSection from "@/components/NewsletterSection";
import Footer from "@/components/Footer";
import { useWikinewsArticles } from "@/hooks/useWikinewsArticles";

const Index = () => {
  const { featuredArticle, featuredPosts, gridArticles, isLoading } =
    useWikinewsArticles();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection
          featuredArticle={featuredArticle}
          featuredPosts={featuredPosts}
          isLoading={isLoading}
        />
        <TopicClusters />
        <ContentGrid articles={gridArticles} isLoading={isLoading} />
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
