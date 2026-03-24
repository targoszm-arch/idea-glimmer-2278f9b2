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
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      <Header />
      <main className={cn("flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 min-h-[calc(100vh-3.5rem)]", className)}>
        {children}
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
};

export default PageLayout;
