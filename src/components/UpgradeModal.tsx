import { X, Zap } from "lucide-react";
import { STRIPE_URLS } from "@/hooks/use-credits";

interface Props {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

export default function UpgradeModal({ open, onClose, reason }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-4 mx-auto">
          <Zap className="w-7 h-7 text-primary" />
        </div>

        <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
          You're out of credits!
        </h2>
        <p className="text-sm text-center text-gray-500 mb-6">
          {reason ?? "Upgrade to a paid plan to keep generating AI content and unlock all features."}
        </p>

        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4 mb-5">
          <div className="text-sm font-semibold text-gray-900 mb-1">Starter Plan</div>
          <div className="text-2xl font-bold text-gray-900 mb-1">€49 <span className="text-sm font-normal text-gray-500">/month</span></div>
          <ul className="text-sm text-gray-600 space-y-1 mt-2">
            <li>✓ 200 AI credits included</li>
            <li>✓ Framer CMS sync</li>
            <li>✓ All integrations</li>
            <li>✓ Cover image generation</li>
          </ul>
        </div>

        <a href={STRIPE_URLS.upgrade} target="_blank" rel="noreferrer"
          className="block w-full text-center bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors mb-3">
          Upgrade Now →
        </a>
        <button onClick={onClose} className="block w-full text-center text-sm text-gray-400 hover:text-gray-600">
          Maybe later
        </button>
      </div>
    </div>
  );
}
