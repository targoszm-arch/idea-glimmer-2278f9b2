import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  hideFooter?: boolean;
  className?: string;
}

const PageLayout = ({ children, hideFooter = false, className }: PageLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className={cn("flex-1 container py-8", className)}>
        {children}
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
};

export default PageLayout;
