import { createPortal } from "react-dom";
import { X, Zap, Lock } from "lucide-react";
import { STRIPE_URLS, TOP_UP_OPTIONS } from "@/hooks/use-credits";

interface Props {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  creditsNeeded?: number;
  creditsAvailable?: number;
}

export default function UpgradeModal({ open, onOpenChange, onClose }: Props) {
  const handleClose = () => { onOpenChange?.(false); onClose?.(); };
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={handleClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-4 mx-auto">
          <Zap className="w-7 h-7 text-primary" />
        </div>

        <h2 className="text-xl font-bold text-center text-gray-900 mb-2">You're out of credits!</h2>
        <p className="text-sm text-center text-gray-500 mb-5">
          Upgrade to a paid plan to keep generating AI content. Credits reset every month.
        </p>

        {/* Upgrade plan */}
        <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-gray-900">Starter Plan</div>
            <div className="text-lg font-bold text-gray-900">€50<span className="text-sm font-normal text-gray-500">/mo</span></div>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>✓ 200 AI credits / month</li>
            <li>✓ Credits reset monthly</li>
            <li>✓ Framer CMS sync</li>
            <li>✓ All integrations</li>
          </ul>
        </div>

        <a href={STRIPE_URLS.upgrade} target="_blank" rel="noreferrer"
          className="block w-full text-center bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors mb-5">
          Upgrade Now →
        </a>

        {/* Top-up options — disabled until subscribed */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Top Up Credits — requires active subscription</span>
          </div>
          <div className="space-y-2">
            {TOP_UP_OPTIONS.map(o => (
              <div key={o.value}
                className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed">
                <span className="text-sm text-gray-500">{o.label}</span>
                <Lock className="w-3.5 h-3.5 text-gray-400" />
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">Upgrade first to unlock top-ups</p>
        </div>

        <button onClick={handleClose} className="block w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-3">
          Maybe later
        </button>
      </div>
    </div>,
    document.body
  );
}
