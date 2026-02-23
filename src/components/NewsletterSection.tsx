import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, CheckCircle2 } from "lucide-react";

const NewsletterSection = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <section id="newsletter" className="bg-primary text-primary-foreground">
      <div className="container py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-2xl text-center"
        >
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-foreground/20">
              <Mail className="h-6 w-6" />
            </div>
          </div>
          <h2 className="text-3xl font-bold">Stay ahead of the curve</h2>
          <p className="mt-3 text-primary-foreground/80">
            Join 25,000+ marketers getting weekly insights on strategy, AI, and growth.
          </p>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="rounded-lg border-2 border-primary-foreground/30 bg-primary-foreground/10 px-4 py-3 text-sm text-primary-foreground placeholder:text-primary-foreground/50 focus:border-primary-foreground/60 focus:outline-none sm:w-80"
              />
              <button
                type="submit"
                className="rounded-lg bg-primary-foreground px-6 py-3 text-sm font-semibold text-primary transition-transform hover:scale-105 active:scale-95"
              >
                Subscribe
              </button>
            </form>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 flex items-center justify-center gap-2 text-lg font-medium"
            >
              <CheckCircle2 className="h-6 w-6" />
              <span>You're in! Check your inbox.</span>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
};

export default NewsletterSection;
