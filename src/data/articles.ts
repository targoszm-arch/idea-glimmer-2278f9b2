export interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  category: string;
  image?: string;
  readTime?: string;
}

export const featuredArticle: Article = {
  id: "featured",
  title: "The future of marketing isn't humans vs. AI — it's humans with AI",
  excerpt: "Content Hub CMO breaks down the new Loop playbook for integrating AI into your marketing strategy without losing the human touch.",
  author: "Jessica Martinez",
  date: "2/15/26",
  category: "Marketing Strategy",
  readTime: "12 min read",
};

export const featuredPosts: Article[] = [
  {
    id: "fp1",
    title: "Here's how (and why) marketers are using AI-generated content [new data & tips]",
    excerpt: "",
    author: "Lipsa Das",
    date: "1/21/26",
    category: "Marketing Strategy",
  },
  {
    id: "fp2",
    title: "Want to Create a Sales Plan? Let Me Show You How [+ 10 Sales Plan Examples]",
    excerpt: "",
    author: "Jay Fuchs",
    date: "12/25/25",
    category: "Sales Enablement",
  },
  {
    id: "fp3",
    title: "6 Steps to Create an Outstanding Marketing Plan [Free Templates]",
    excerpt: "",
    author: "Rebecca Riserbato",
    date: "11/23/25",
    category: "Marketing Strategy",
  },
  {
    id: "fp4",
    title: "What is a customer journey map? The complete overview [examples + templates]",
    excerpt: "",
    author: "Diego Alamir",
    date: "10/9/25",
    category: "Customer Success",
  },
  {
    id: "fp5",
    title: "20 UX Design Examples Hand-Picked by Experts [With Analysis]",
    excerpt: "",
    author: "Amy Rigby",
    date: "9/7/25",
    category: "Product Management",
  },
];

export const gridArticles: Article[] = [
  {
    id: "g1",
    title: "Learn from My Mistakes: 7 Digital Course Pitfalls to Skip",
    excerpt: "Discover the top digital course pitfalls to avoid from experienced creator Amy Porterfield. Skip com...",
    author: "Amy Porterfield",
    date: "1/9/26",
    category: "Marketing Strategy",
  },
  {
    id: "g2",
    title: "How To Do Representation in Marketing the Right Way (+ Consumer Data)",
    excerpt: "Consumers want to see themselves in marketing materials. Learn why representation in marketing is so...",
    author: "Sonia Thompson",
    date: "11/27/25",
    category: "Marketing Strategy",
  },
  {
    id: "g3",
    title: "The Psychology of Short-Form Content: Why We Love Bite-Sized Media",
    excerpt: "Ever wonder why short-form videos are so popular? Turns out there's a bit of psychology behind it.",
    author: "Erica Santiago",
    date: "2/10/26",
    category: "Customer Success",
  },
  {
    id: "g4",
    title: "AI's impact on social media: Top trends and predictions from experts",
    excerpt: "Learn how AI can enhance your social media strategy — plus, how social media marketers are already u...",
    author: "Caroline Forsey",
    date: "1/8/26",
    category: "Product Management",
  },
];

export const topicClusters = [
  { name: "Marketing Strategy", count: 47 },
  { name: "Sales Enablement", count: 38 },
  { name: "Customer Success", count: 42 },
  { name: "Product Management", count: 35 },
];
