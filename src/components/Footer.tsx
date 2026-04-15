import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-secondary/50">
      <div className="container py-[10px]">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold text-foreground">
            Content<span className="text-primary">Lab</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link to="/connect/claude" className="hover:text-foreground transition-colors">Connect Claude</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/support" className="hover:text-foreground transition-colors">Support</Link>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 Content Lab. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
