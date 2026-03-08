import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import NewArticle from "./pages/NewArticle";
import EditArticle from "./pages/EditArticle";
import ContentIdeas from "./pages/ContentIdeas";
import AISettings from "./pages/AISettings";
import Article from "./pages/Article";
import SocialMedia from "./pages/SocialMedia";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewArticle />} />
          <Route path="/edit/:id" element={<EditArticle />} />
          <Route path="/ideas" element={<ContentIdeas />} />
          <Route path="/settings" element={<AISettings />} />
          <Route path="/article/:id" element={<Article />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
