import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, ExternalLink } from "lucide-react";
import { STRIPE_URLS } from "@/hooks/use-credits";

interface OutOfCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditsNeeded?: number;
  creditsAvailable?: number;
}

const OutOfCreditsDialog = ({ open, onOpenChange, creditsNeeded, creditsAvailable }: OutOfCreditsDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <CreditCard className="h-5 w-5" />
            Not Enough Credits
          </DialogTitle>
          <DialogDescription>
            {creditsNeeded !== undefined && creditsAvailable !== undefined
              ? `This action requires ${creditsNeeded} credits, but you only have ${creditsAvailable}.`
              : "You've run out of credits. Top up to continue generating AI content."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            onClick={() => window.open(STRIPE_URLS.topUp100, "_blank")}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              100 Credits
            </span>
            <span className="text-primary-foreground/80">€25</span>
          </Button>
          <Button
            onClick={() => window.open(STRIPE_URLS.topUp50, "_blank")}
            className="w-full justify-between"
            variant="secondary"
          >
            <span className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              200 Credits
            </span>
            <span className="text-secondary-foreground/80">€50</span>
          </Button>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <button
              onClick={() => window.open(STRIPE_URLS.customerPortal, "_blank")}
              className="text-xs text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Manage Billing
            </button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OutOfCreditsDialog;
