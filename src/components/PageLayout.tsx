import { cn } from "@/lib/utils";

interface PageLayoutProps {
  children: React.ReactNode;
  hideFooter?: boolean;
  className?: string;
}

const PageLayout = ({ children, className }: PageLayoutProps) => {
  return (
    <div className={cn("w-full max-w-7xl mx-auto px-4 sm:px-6 py-6", className)}>
      {children}
    </div>
  );
};

export default PageLayout;
