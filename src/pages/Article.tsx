import { useParams, Link } from "react-router-dom";
import { motion, useScroll, useSpring } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NewsletterSection from "@/components/NewsletterSection";
import { ArrowLeft, Clock, Calendar } from "lucide-react";
import heroImage from "@/assets/hero-featured.jpg";
import article1 from "@/assets/article-1.jpg";
import article2 from "@/assets/article-2.jpg";
import article3 from "@/assets/article-3.jpg";
import article4 from "@/assets/article-4.jpg";

interface ArticleData {
  title: string;
  author: string;
  role: string;
  date: string;
  readTime: string;
  category: string;
  image: string;
  body: string[];
}

const articleContent: Record<string, ArticleData> = {
  featured: {
    title: "The future of marketing isn't humans vs. AI — it's humans with AI",
    author: "Jessica Martinez",
    role: "VP of Marketing, Content Hub",
    date: "February 15, 2026",
    readTime: "12 min read",
    category: "Marketing Strategy",
    image: heroImage,
    body: [
      "The conversation around AI in marketing has been dominated by fear. Will AI replace marketers? Will content lose its soul? Will algorithms decide everything we create? After spending two years integrating AI into our marketing operations at Content Hub, I can tell you the answer is a resounding no.",
      "But here's the thing — the real story is far more interesting than a simple binary. The future of marketing isn't about choosing between human creativity and machine efficiency. It's about combining them in ways that neither could achieve alone.",
      "## The Loop Playbook",
      "We call our framework 'The Loop' because it's designed to be cyclical. AI generates ideas and drafts. Humans refine, add nuance, and inject brand voice. AI then optimizes distribution and measures performance. Humans interpret the data and set new creative direction. Round and round we go, each cycle producing better results than the last.",
      "When we first implemented The Loop, our content output increased by 3x. But more importantly, our engagement metrics improved across the board. Average time on page went up 23%. Social shares increased by 47%. And our lead generation from content marketing grew by 61%.",
      "## Where AI Excels",
      "Let's be honest about what AI does exceptionally well. It's brilliant at pattern recognition — identifying which topics are trending, which headlines perform best, which content formats resonate with specific audience segments. It can analyze thousands of data points in seconds and surface insights that would take a human analyst weeks to uncover.",
      "AI is also remarkable at handling the repetitive, time-consuming tasks that eat into creative time. Meta descriptions, social media copy variations, email subject line testing, image alt text — these are all areas where AI can save hours of manual work every week.",
      "## Where Humans Are Irreplaceable",
      "But AI falls flat in some critical areas. It can't truly understand the emotional weight of a customer's pain point. It can't build genuine relationships with sources and industry experts. It can't make the intuitive creative leaps that produce truly breakthrough campaigns.",
      "Most importantly, AI can't understand context the way humans can. It doesn't know that your CEO just gave a keynote that shifted the company's positioning. It doesn't understand that a competitor's recent controversy creates an opportunity for thoughtful commentary. It can't read the room.",
      "## Getting Started",
      "If you're looking to implement a similar approach, start small. Pick one area of your content workflow — maybe it's research, maybe it's repurposing, maybe it's analytics — and introduce AI there. Let your team get comfortable with the technology before expanding.",
      "The most successful AI integrations we've seen aren't the ones that try to automate everything overnight. They're the ones that thoughtfully augment human capabilities, one workflow at a time.",
      "The future belongs to marketing teams that learn to dance with AI — not fight it, not surrender to it, but truly partner with it. And that future is already here.",
    ],
  },
  fp1: {
    title: "Here's how (and why) marketers are using AI-generated content [new data & tips]",
    author: "Lipsa Das",
    role: "Senior Content Strategist",
    date: "January 21, 2026",
    readTime: "9 min read",
    category: "Marketing Strategy",
    image: article1,
    body: [
      "AI-generated content has gone from a fringe experiment to a mainstream marketing tool in record time. But how are marketers actually using it — and what results are they seeing? We surveyed over 1,200 marketing professionals to find out.",
      "The data tells a compelling story. 73% of marketers now use AI in some capacity for content creation. But the way they use it might surprise you — it's not about replacing writers, it's about amplifying them.",
      "## The Most Common Use Cases",
      "Our survey revealed five primary ways marketers are leveraging AI content tools. First and most popular: brainstorming and ideation. 82% of AI-using marketers say they use it to generate topic ideas, outline structures, and explore angles they might not have considered.",
      "Second is first-draft creation. About 61% use AI to produce initial drafts that human editors then refine. Third is repurposing — taking a long-form piece and generating social posts, email snippets, and summaries. Fourth is SEO optimization, including keyword research and meta description generation. Fifth is personalization at scale.",
      "## What the Data Says About Quality",
      "Here's where it gets interesting. Only 12% of marketers publish AI content without human editing. The vast majority — 88% — treat AI output as a starting point that requires significant human refinement. And the marketers who report the best results are the ones who invest the most in that editing layer.",
      "Teams that spend at least 30 minutes editing AI-generated drafts report 2.4x higher engagement than those who do minimal editing. The sweet spot appears to be using AI to handle the structural and research-heavy lifting while letting humans handle voice, nuance, and storytelling.",
      "## Tips for Getting Started",
      "If you're new to AI content, start with low-stakes projects. Internal communications, social media captions, and email subject line variations are great places to experiment without risk. Build your comfort level before tackling customer-facing long-form content.",
      "Develop a clear editorial process that defines where AI fits and where human judgment is non-negotiable. Document your brand voice guidelines so you can consistently evaluate whether AI output meets your standards.",
      "Finally, measure everything. Track engagement metrics for AI-assisted content versus purely human-created content. The data will tell you where AI adds value and where it falls short for your specific audience.",
    ],
  },
  fp2: {
    title: "Want to Create a Sales Plan? Let Me Show You How [+ 10 Sales Plan Examples]",
    author: "Jay Fuchs",
    role: "Sales Strategy Editor",
    date: "December 25, 2025",
    readTime: "15 min read",
    category: "Sales Enablement",
    image: article2,
    body: [
      "Every successful sales organization runs on a well-crafted sales plan. It's the document that aligns your team, sets expectations, and provides a roadmap for hitting your targets. Yet surprisingly, nearly 40% of sales teams operate without a formal one.",
      "I've helped hundreds of sales leaders build their plans from scratch, and I've seen what works and what doesn't. Here's the complete framework I recommend, plus ten real examples you can adapt for your own team.",
      "## What Makes a Great Sales Plan",
      "A great sales plan isn't a 50-page document that collects dust in a shared drive. It's a living, actionable guide that your team references weekly. The best plans share three qualities: they're specific enough to be actionable, flexible enough to adapt to market changes, and simple enough that everyone on the team understands their role.",
      "At its core, your sales plan should answer four questions: Where are we now? Where do we want to be? How will we get there? How will we know we're on track?",
      "## The Essential Components",
      "Start with your revenue targets. Break them down by quarter, by product line, and by team member. Then work backward to determine the activity metrics needed to hit those targets — calls made, demos booked, proposals sent, deals closed.",
      "Next, define your ideal customer profile and buyer personas. Your team should be able to describe your best-fit customer in one sentence. This clarity eliminates wasted effort on prospects who will never close.",
      "Include your competitive positioning. What do you say when a prospect asks why they should choose you over the alternative? Every rep should deliver a consistent, compelling answer.",
      "## Building Your Action Plan",
      "The action plan is where strategy meets execution. For each quarter, identify three to five key initiatives that will drive results. Maybe it's launching an outbound campaign to a new vertical, implementing a new demo framework, or building a partner referral program.",
      "Assign owners to every initiative. Set deadlines. Define success metrics. And schedule monthly reviews to assess progress and adjust course. The plans that succeed are the ones that build in accountability from the start.",
      "## Common Mistakes to Avoid",
      "The biggest mistake I see is setting targets without a clear path to achieve them. Saying 'grow revenue 30%' without explaining how is wishful thinking, not planning. Every target needs a corresponding strategy and set of tactics.",
      "Another common pitfall is building a plan in isolation. Your sales plan should be developed collaboratively with marketing, customer success, and product teams. Revenue is a team sport, and your plan should reflect that.",
    ],
  },
  fp3: {
    title: "6 Steps to Create an Outstanding Marketing Plan [Free Templates]",
    author: "Rebecca Riserbato",
    role: "Marketing Operations Lead",
    date: "November 23, 2025",
    readTime: "11 min read",
    category: "Marketing Strategy",
    image: article3,
    body: [
      "A marketing plan is more than a list of campaigns you want to run. It's a strategic document that connects your marketing activities to business objectives, allocates resources effectively, and provides a framework for measuring success.",
      "Whether you're building your first marketing plan or revamping an existing one, these six steps will help you create a plan that actually drives results.",
      "## Step 1: Define Your Marketing Goals",
      "Start with the end in mind. What does marketing success look like for your organization this year? Your goals should be SMART — Specific, Measurable, Achievable, Relevant, and Time-bound. Instead of 'increase brand awareness,' try 'increase organic website traffic by 40% by Q3.'",
      "Limit yourself to three to five primary goals. More than that, and you'll spread your resources too thin. Each goal should directly support a broader business objective.",
      "## Step 2: Know Your Audience",
      "Deep audience understanding is the foundation of effective marketing. Go beyond basic demographics. Understand your audience's pain points, information sources, decision-making process, and the language they use to describe their challenges.",
      "Conduct interviews with your best customers. Analyze your CRM data for patterns. Survey your audience about their preferences. The more specific your understanding, the more targeted and effective your marketing will be.",
      "## Step 3: Audit Your Current Efforts",
      "Before planning new initiatives, assess what's already working. Review your analytics to identify top-performing content, channels, and campaigns. Look for patterns — what topics resonate? Which formats drive the most engagement? Where are the gaps?",
      "This audit will help you double down on what works and stop wasting resources on what doesn't.",
      "## Step 4: Choose Your Channels and Tactics",
      "You can't be everywhere. Choose the channels where your audience is most active and where you can create a genuine competitive advantage. It's better to excel on two channels than to be mediocre on six.",
      "For each channel, define your content strategy, posting cadence, and key metrics. Build a content calendar that maps to your goals and audience needs.",
      "## Step 5: Set Your Budget",
      "Allocate your budget based on your goals and the channels you've selected. A common framework is 70/20/10: 70% on proven tactics, 20% on emerging opportunities, and 10% on experimental initiatives.",
      "## Step 6: Build Your Measurement Framework",
      "Define how you'll track progress toward each goal. Set up dashboards, establish reporting cadences, and identify the leading indicators that predict success. Don't just measure what's easy to measure — measure what matters.",
    ],
  },
  fp4: {
    title: "What is a customer journey map? The complete overview [examples + templates]",
    author: "Diego Alamir",
    role: "Customer Experience Director",
    date: "October 9, 2025",
    readTime: "14 min read",
    category: "Customer Success",
    image: article4,
    body: [
      "A customer journey map is a visual representation of every interaction a customer has with your brand, from their first moment of awareness to long-term loyalty. It's one of the most powerful tools in a marketer's arsenal — yet it's often misunderstood or underutilized.",
      "When done right, journey mapping reveals the gaps between the experience you think you're delivering and the one your customers actually have. That insight is gold.",
      "## Why Journey Mapping Matters",
      "Companies that actively manage customer journeys see a 54% greater return on marketing investment. That's because journey maps force you to think from the customer's perspective — not your organizational structure.",
      "Most companies are organized by department: marketing, sales, support, product. But customers don't experience your brand through departmental lenses. They experience a continuous journey, and any friction point along the way can derail the entire relationship.",
      "## The Five Stages of the Customer Journey",
      "While every business is different, most customer journeys follow five stages. Awareness: the customer realizes they have a problem. Consideration: they research potential solutions. Decision: they choose a provider. Onboarding: they start using the product. Advocacy: they become a loyal promoter.",
      "For each stage, your map should document what the customer is thinking, feeling, and doing. What questions do they have? What channels are they using? What could go wrong?",
      "## How to Build Your First Journey Map",
      "Start by selecting a specific persona and a specific journey — don't try to map everything at once. Gather data from customer interviews, support tickets, analytics, and sales call recordings. Look for patterns in behavior and sentiment.",
      "Plot each touchpoint on a timeline. Note the customer's emotional state at each point — where are they delighted, frustrated, or confused? These emotional peaks and valleys are where your biggest opportunities live.",
      "## Turning Insights Into Action",
      "A journey map is only valuable if it drives change. Identify the three biggest friction points and create action plans to address them. Assign owners, set deadlines, and measure the impact of your improvements.",
      "Revisit your journey map quarterly. Customer expectations evolve, your product changes, and new competitors emerge. Your map should be a living document that evolves with your business.",
      "The companies that win aren't the ones with the best products — they're the ones that deliver the best experiences. And it all starts with understanding the journey.",
    ],
  },
  fp5: {
    title: "20 UX Design Examples Hand-Picked by Experts [With Analysis]",
    author: "Amy Rigby",
    role: "UX Research Lead",
    date: "September 7, 2025",
    readTime: "18 min read",
    category: "Product Management",
    image: article1,
    body: [
      "Great UX design is invisible. When everything works seamlessly, users don't think about the interface — they just accomplish their goals. But achieving that level of simplicity requires incredible intentionality and craft.",
      "We asked 15 UX experts to share the designs they admire most and explain what makes them exceptional. Here are their top 20 picks, with detailed analysis of what each one gets right.",
      "## What Makes UX 'Great'?",
      "Before diving into examples, let's align on what we're evaluating. Great UX isn't just about aesthetics — it's about effectiveness. A beautiful interface that confuses users is bad UX. A plain interface that helps users accomplish their goals effortlessly is great UX.",
      "Our experts evaluated designs across four dimensions: usability (how easy is it to use?), accessibility (can everyone use it?), delight (does it create positive emotions?), and efficiency (how quickly can users accomplish their goals?).",
      "## E-Commerce Excellence",
      "Several of our experts pointed to innovative e-commerce experiences. One standout is a grocery delivery app that remembers your purchase patterns and presents a pre-built cart each week. The UX insight: reduce the number of decisions users need to make.",
      "Another favorite is a fashion retailer that uses AI-powered visual search — snap a photo of an outfit you like, and the app finds similar items in your size and budget. The friction of translating inspiration into action is nearly eliminated.",
      "## SaaS Standouts",
      "In the B2B space, the best UX designs share a common trait: progressive disclosure. They show users exactly what they need at each moment, hiding complexity until it's relevant. One project management tool was praised for its empty states — instead of a blank screen, new users see a guided tutorial that builds their first project step by step.",
      "Another SaaS example that earned praise is a CRM that automatically logs customer interactions across email, phone, and chat. The UX decision to eliminate manual data entry transformed user adoption from 40% to 92%.",
      "## Mobile-First Mastery",
      "Mobile UX requires even more discipline because screen space is limited. The experts highlighted a banking app that lets users complete any common task in three taps or fewer. Every feature was designed around a simple question: what's the minimum number of steps?",
      "The common thread across all 20 examples is empathy. The best UX designers don't just study usability principles — they deeply understand their users' contexts, constraints, and goals. They design for real people in real situations, not ideal scenarios in conference rooms.",
    ],
  },
  g1: {
    title: "Learn from My Mistakes: 7 Digital Course Pitfalls to Skip",
    author: "Amy Porterfield",
    role: "Digital Course Creator",
    date: "January 9, 2026",
    readTime: "8 min read",
    category: "Marketing Strategy",
    image: article1,
    body: [
      "I've launched over a dozen digital courses in my career, and I've made every mistake in the book. Some cost me thousands of dollars. Others cost me months of wasted effort. All of them taught me something valuable that I want to share with you.",
      "If you're thinking about creating a digital course — or you've already started and it's not going as planned — these seven pitfalls are the ones I wish someone had warned me about.",
      "## Pitfall 1: Building Before Validating",
      "My first course took six months to create. I spent hundreds of hours recording videos, designing worksheets, and building a beautiful course platform. Then I launched it to crickets. The problem? I never validated that anyone actually wanted what I was selling.",
      "Now I validate every course idea before building it. I pre-sell the concept, gauge interest through surveys, and run live workshops to test the material. Only when I have confirmed demand do I invest in full production.",
      "## Pitfall 2: Trying to Cover Everything",
      "New course creators tend to pack in too much content, thinking more equals more value. The opposite is true. Students are overwhelmed by 40-hour courses. They want focused, actionable content that solves a specific problem.",
      "My best-performing courses are the ones with the tightest scope. Aim for a transformation, not a textbook.",
      "## Pitfall 3: Ignoring the Launch Strategy",
      "A great course with no launch strategy is like a restaurant with no sign. You need to build anticipation, nurture your audience, and create urgency. I now spend as much time planning my launch as I do creating the course itself.",
      "## Pitfall 4: Skipping Community",
      "Students who feel connected to a community complete courses at 5x the rate of those who learn alone. Build a community element into your course from day one — whether it's a forum, live Q&A sessions, or accountability groups.",
      "## Pitfall 5: Perfectionism",
      "Your first version doesn't need to be perfect. It needs to be helpful. Launch with a minimum viable course, gather feedback, and improve iteratively. Some of my most successful courses started as rough live workshops that I refined over multiple cohorts.",
      "The perfect course that never launches helps no one. The imperfect course that ships today can change someone's life this week.",
    ],
  },
  g2: {
    title: "How To Do Representation in Marketing the Right Way (+ Consumer Data)",
    author: "Sonia Thompson",
    role: "Inclusive Marketing Strategist",
    date: "November 27, 2025",
    readTime: "10 min read",
    category: "Marketing Strategy",
    image: article2,
    body: [
      "Consumers are paying attention to representation in marketing — and they're making purchasing decisions based on what they see. Our latest research surveyed 5,000 consumers across demographics, and the findings are clear: authentic representation isn't just the right thing to do, it's a business imperative.",
      "67% of consumers say they're more likely to purchase from brands that reflect their identity in marketing materials. But there's a catch — they can spot tokenism from a mile away.",
      "## The Data Behind Representation",
      "Our survey revealed that 78% of consumers have noticed when brands use diverse imagery that feels forced or inauthentic. The top complaint? Using diverse faces in ads while failing to create products or experiences that serve diverse communities.",
      "Representation goes far beyond stock photography. It includes the language you use, the stories you tell, the models you feature, the influencers you partner with, and — critically — the people you hire to make these decisions.",
      "## Getting It Right: A Framework",
      "Authentic representation starts with your team. If your marketing department doesn't reflect the diversity of your audience, you're starting at a disadvantage. Diverse teams naturally create more inclusive content because they bring varied perspectives to the creative process.",
      "Next, do your research. Don't assume you understand a community's experience — ask. Conduct focus groups, partner with community organizations, and hire consultants who can provide cultural insight.",
      "## Common Mistakes to Avoid",
      "The biggest mistake brands make is treating representation as a campaign rather than a commitment. One diverse ad during Black History Month doesn't make you an inclusive brand. Consumers see through performative gestures.",
      "Another common error is conflating representation with stereotyping. Showing diverse faces while relying on cultural clichés does more harm than good. Real representation shows people as complex, multidimensional individuals.",
      "## The Business Impact",
      "Brands that get representation right see measurable results. Our data shows a 23% increase in brand loyalty among consumers who feel represented. More importantly, these consumers become advocates — they're 3.2x more likely to recommend the brand to friends and family.",
      "The path to authentic representation isn't always easy, but it's essential. Start by listening, commit to learning, and be willing to make mistakes and grow. Your customers — and your bottom line — will thank you.",
    ],
  },
  g3: {
    title: "The Psychology of Short-Form Content: Why We Love Bite-Sized Media",
    author: "Erica Santiago",
    role: "Content Psychology Researcher",
    date: "February 10, 2026",
    readTime: "7 min read",
    category: "Customer Success",
    image: article3,
    body: [
      "Ever wonder why you can scroll through short-form videos for an hour but struggle to read a long article for five minutes? The answer lies in the psychology of how our brains process and reward information consumption.",
      "Short-form content — videos under 60 seconds, tweets, carousel posts — has exploded in popularity. But the reasons go deeper than shrinking attention spans. Understanding the psychology can make you a better content creator.",
      "## The Dopamine Loop",
      "Every time you swipe to a new video, your brain experiences a micro-dose of novelty. Novelty triggers dopamine release — the same neurotransmitter associated with rewards and motivation. Short-form content creates a rapid-fire dopamine loop that keeps you engaged.",
      "This isn't inherently good or bad. It's just how our brains are wired. As marketers, understanding this mechanism helps us create content that genuinely resonates rather than simply exploiting psychological vulnerabilities.",
      "## The Completion Effect",
      "There's a deep psychological satisfaction in completing something. Short-form content gives us that satisfaction dozens of times per session. Each finished video is a micro-accomplishment that our brains register as progress.",
      "Long-form content, by contrast, requires sustained effort before delivering that completion reward. This doesn't mean long-form is inferior — it means it needs to work harder to maintain engagement along the way.",
      "## Variable Reward Schedules",
      "The unpredictability of what comes next in a content feed mirrors what psychologists call a variable reward schedule — the same mechanism that makes slot machines addictive. You never know if the next piece of content will be mediocre or incredible, so you keep scrolling.",
      "## What This Means for Marketers",
      "Understanding these psychological mechanisms doesn't mean you should only create short-form content. It means you should apply these principles regardless of format. Hook your audience immediately. Deliver value quickly. Create moments of surprise and delight throughout longer pieces.",
      "The best content creators use short-form to build awareness and trust, then guide their audience to longer, deeper content where real transformation happens. It's not either/or — it's a strategic content ecosystem.",
      "The psychology of attention is complex, but the principle is simple: respect your audience's time, deliver value consistently, and make every second count.",
    ],
  },
  g4: {
    title: "AI's impact on social media: Top trends and predictions from experts",
    author: "Caroline Forsey",
    role: "Social Media Trends Analyst",
    date: "January 8, 2026",
    readTime: "13 min read",
    category: "Product Management",
    image: article4,
    body: [
      "AI is reshaping social media in ways we couldn't have predicted even two years ago. From AI-generated influencers to predictive audience targeting, the landscape is evolving at breakneck speed. We spoke with 20 industry experts to map out the biggest trends and predictions for 2026.",
      "The consensus? AI won't replace social media marketers — but social media marketers who use AI will replace those who don't.",
      "## Trend 1: AI-Powered Content Creation at Scale",
      "The most immediate impact of AI on social media is the ability to create more content, faster. Tools can now generate platform-specific variations of a single piece of content in seconds — optimizing format, length, and tone for each channel.",
      "But experts warn against using this capability to simply flood feeds with mediocre content. The brands winning with AI are using it to maintain quality while increasing frequency and experimentation.",
      "## Trend 2: Predictive Analytics and Audience Intelligence",
      "AI is transforming how brands understand their audiences. Predictive models can now identify which followers are most likely to convert, which content topics will trend next week, and which posting times will maximize engagement for specific audience segments.",
      "One expert described it as moving from 'rear-view mirror analytics' to 'windshield analytics.' Instead of reporting what happened, AI helps you anticipate what will happen.",
      "## Trend 3: Hyper-Personalized Experiences",
      "Social media feeds are already personalized by algorithms, but AI is enabling brands to create personalized content at the individual level. Dynamic creative optimization can now adjust ad visuals, copy, and calls to action based on a user's past behavior and preferences.",
      "## Trend 4: AI Moderation and Brand Safety",
      "As social media environments become more complex, AI moderation tools are becoming essential. These tools can identify brand-safety risks in real-time, flagging content that appears adjacent to controversial material before it damages your reputation.",
      "## Predictions for the Future",
      "Looking ahead, experts predict that AI-generated virtual influencers will become mainstream for product launches, social commerce will be driven almost entirely by AI recommendation engines, and real-time content optimization will become table stakes.",
      "The experts agree on one thing: the social media marketers who thrive will be the ones who view AI as a creative partner, not a replacement. The technology handles the data and optimization. Humans handle the strategy, creativity, and community building that no algorithm can replicate.",
    ],
  },
};

const Article = () => {
  const { id } = useParams();
  const article = articleContent[id as keyof typeof articleContent];
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  if (!article) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container max-w-3xl mx-auto py-20 px-6 text-center">
          <h1 className="text-2xl font-bold text-foreground">Article not found</h1>
          <Link to="/" className="mt-4 inline-block text-primary hover:underline">← Back to Home</Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <motion.div className="fixed top-0 left-0 right-0 h-1 bg-primary z-[60] origin-left" style={{ scaleX }} />
      <Header />
      <main>
        <article className="container max-w-3xl mx-auto py-10 px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>

            <span className="text-sm font-semibold text-primary">{article.category}</span>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold text-foreground leading-tight">{article.title}</h1>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">{article.author}</span>
                <span className="block text-xs">{article.role}</span>
              </div>
              <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{article.date}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{article.readTime}</span>
            </div>

            <div className="mt-8 overflow-hidden rounded-xl">
              <img src={article.image} alt={article.title} className="w-full aspect-[16/9] object-cover" />
            </div>

            <div className="mt-10 space-y-5">
              {article.body.map((paragraph, i) => {
                if (paragraph.startsWith("## ")) {
                  return <h2 key={i} className="text-2xl font-bold text-foreground pt-4">{paragraph.replace("## ", "")}</h2>;
                }
                return <p key={i} className="text-lg leading-relaxed text-foreground/90">{paragraph}</p>;
              })}
            </div>

            <div className="mt-12 rounded-xl bg-primary/10 border-2 border-primary/30 p-6 text-center">
              <h3 className="text-lg font-bold text-foreground">Want more insights like this?</h3>
              <p className="mt-1 text-sm text-muted-foreground">Join 25,000+ marketers getting weekly strategy breakdowns.</p>
              <Link to="/#newsletter" className="mt-4 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-105 active:scale-95">
                Subscribe Free
              </Link>
            </div>
          </motion.div>
        </article>
        <NewsletterSection />
      </main>
      <Footer />
    </div>
  );
};

export default Article;
