import { useLocation, useNavigate } from "react-router-dom";
import PageLayout from "@/components/PageLayout";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

// Lazy load each tab's content
const AISettings    = lazy(() => import("./AISettings"));
const BrandAssets   = lazy(() => import("./BrandAssets"));
const Integrations  = lazy(() => import("./Integrations"));

const TABS = [
  { key: "ai",           label: "AI Settings",  path: "/settings" },
  { key: "brand",        label: "Brand",         path: "/settings/brand" },
  { key: "integrations", label: "Integrations",  path: "/settings/integrations" },
];

const Settings = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab =
    location.pathname === "/settings/brand"        ? "brand" :
    location.pathname === "/settings/integrations" ? "integrations" : "ai";

  return (
    <PageLayout>
      {/* Tab bar */}
      <div className="border-b border-border mb-6 -mt-2">
        <nav className="flex">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => navigate(tab.path)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        {activeTab === "ai"           && <AISettings embedded />}
        {activeTab === "brand"        && <BrandAssets embedded />}
        {activeTab === "integrations" && <Integrations embedded />}
      </Suspense>
    </PageLayout>
  );
};

export default Settings;
