import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Coins } from "lucide-react";
import { TOP_UP_OPTIONS } from "@/hooks/use-credits";

interface Props {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

export default function TopUpModal({ open, onOpenChange, onClose }: Props) {
  const handleClose = () => { onOpenChange?.(false); onClose?.(); };
  const [selected, setSelected] = useState("");
  const option = TOP_UP_OPTIONS.find(o => o.value === selected);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative animate-in fade-in zoom-in-95 duration-200">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center justify-center w-14 h-14 bg-primary/10 rounded-2xl mb-4 mx-auto">
          <Coins className="w-7 h-7 text-primary" />
        </div>

        <h2 className="text-xl font-bold text-center text-gray-900 mb-2">Top Up Credits</h2>
        <p className="text-sm text-center text-gray-500 mb-6">
          You've run out of credits. Select an amount to top up and continue generating content.
        </p>

        <div className="space-y-3 mb-5">
          {TOP_UP_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setSelected(o.value)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                selected === o.value
                  ? "border-primary bg-primary/5"
                  : "border-gray-200 hover:border-primary/40"
              }`}
            >
              <span className="font-medium text-gray-900">{o.label}</span>
              {selected === o.value && <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">Selected</span>}
            </button>
          ))}
        </div>

        <a
          href={option?.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          onClick={e => { if (!option) e.preventDefault(); }}
          className={`block w-full text-center font-semibold py-3 rounded-xl transition-colors mb-3 ${
            option
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {option ? `Top Up ${option.label} →` : "Select an amount above"}
        </a>
        <button onClick={onClose} className="block w-full text-center text-sm text-gray-400 hover:text-gray-600">
          Maybe later
        </button>
      </div>
    </div>
  );
}
