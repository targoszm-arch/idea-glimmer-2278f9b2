import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Routes that should NOT show the header/footer
const NO_HEADER_ROUTES = ["/", "/login", "/signup", "/signup/confirm", "/payment-success", "/reset-password"];

interface AppShellProps {
  children: React.ReactNode;
}

const AppShell = ({ children }: AppShellProps) => {
  const location = useLocation();
  const showHeader = !NO_HEADER_ROUTES.includes(location.pathname);

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden">
      {showHeader && <Header />}
      <main className="flex-1">
        {children}
      </main>
      {showHeader && <Footer />}
    </div>
  );
};

export default AppShell;
