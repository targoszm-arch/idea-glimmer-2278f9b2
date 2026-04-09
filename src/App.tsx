import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import NewArticle from "./pages/NewArticle";
import EditArticle from "./pages/EditArticle";
import ContentIdeas from "./pages/ContentIdeas";
import AISettings from "./pages/AISettings";
import Settings from "./pages/Settings";
import Article from "./pages/Article";
import SocialMedia from "./pages/SocialMedia";
import SocialLibrary from "./pages/SocialLibrary";
import BrandAssets from "./pages/BrandAssets";
import MediaLibrary from "./pages/MediaLibrary";
import NotFound from "./pages/NotFound";
import FramerPlugin from "./pages/FramerPlugin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Integrations from "./pages/Integrations";
import APIKey from "./pages/APIKey";
import PaymentSuccess from "./pages/PaymentSuccess";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import Automations from "./pages/Automations";
import CalendarPage from "./pages/Calendar";
import SignupConfirm from "./pages/SignupConfirm";
import NewsletterAnalytics from "./pages/NewsletterAnalytics";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Analytics />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppShell>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/new" element={<ProtectedRoute><NewArticle /></ProtectedRoute>} />
            <Route path="/edit/:id" element={<ProtectedRoute><EditArticle /></ProtectedRoute>} />
            <Route path="/ideas" element={<ProtectedRoute><ContentIdeas /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/article/:id" element={<ProtectedRoute><Article /></ProtectedRoute>} />
            <Route path="/social" element={<ProtectedRoute><SocialMedia /></ProtectedRoute>} />
            <Route path="/social-library" element={<ProtectedRoute><SocialLibrary /></ProtectedRoute>} />
            <Route path="/automations" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><CalendarPage /></ProtectedRoute>} />
            <Route path="/brand" element={<ProtectedRoute><MediaLibrary /></ProtectedRoute>} />
            <Route path="/framer-plugin-setup" element={<ProtectedRoute><FramerPlugin /></ProtectedRoute>} />
            <Route path="/payment-success" element={<PaymentSuccess />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/signup/confirm" element={<SignupConfirm />} />
            <Route path="/settings/api-key" element={<ProtectedRoute><APIKey /></ProtectedRoute>} />
            <Route path="/settings/brand" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/settings/integrations" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/newsletter/analytics" element={<ProtectedRoute><NewsletterAnalytics /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><NewsletterAnalytics /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </AppShell>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
