const Footer = () => {
  return (
    <footer className="border-t border-border bg-secondary/50 justify-end ">
      <div className="container py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm font-bold text-foreground">
            Content<span className="text-primary">Hub</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">About</a>
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Contact</a>
          </div>
          <p className="text-xs text-muted-foreground">
            © 2026 Content Hub. All rights reserved.
          </p>
        </div>
      </div>
    </footer>);

};

export default Footer;