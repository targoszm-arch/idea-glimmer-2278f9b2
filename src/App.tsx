import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import NewArticle from "./pages/NewArticle";
import EditArticle from "./pages/EditArticle";
import ContentIdeas from "./pages/ContentIdeas";
import AISettings from "./pages/AISettings";
import Article from "./pages/Article";
import SocialMedia from "./pages/SocialMedia";
import BrandAssets from "./pages/BrandAssets";
import NotFound from "./pages/NotFound";
import FramerPlugin from "./pages/FramerPlugin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/new" element={<ProtectedRoute><NewArticle /></ProtectedRoute>} />
            <Route path="/edit/:id" element={<ProtectedRoute><EditArticle /></ProtectedRoute>} />
            <Route path="/ideas" element={<ProtectedRoute><ContentIdeas /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><AISettings /></ProtectedRoute>} />
            <Route path="/article/:id" element={<ProtectedRoute><Article /></ProtectedRoute>} />
            <Route path="/social" element={<ProtectedRoute><SocialMedia /></ProtectedRoute>} />
            <Route path="/brand" element={<ProtectedRoute><BrandAssets /></ProtectedRoute>} />
            <Route path="/framer-plugin-setup" element={<ProtectedRoute><FramerPlugin /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
