import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import TopicClusters from "@/components/TopicClusters";
import ContentGrid from "@/components/ContentGrid";
import NewsletterSection from "@/components/NewsletterSection";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <HeroSection />
        <TopicClusters />
        <ContentGrid />
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
