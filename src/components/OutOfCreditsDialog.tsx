import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";

const STRIPE_CHECKOUT_URL = "https://buy.stripe.com/bJe6oH2v92vRbJG9J17EQ0f";

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
              : "You've run out of credits. Purchase more to continue generating AI content."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 mt-4">
          <Button
            onClick={() => window.open(STRIPE_CHECKOUT_URL, "_blank")}
            className="w-full"
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Buy More Credits
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default OutOfCreditsDialog;
