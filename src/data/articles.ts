export interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  date: string;
  category: string;
  image?: string;
  readTime?: string;
  url?: string;
}

export const topicClusters = [
  { name: "Marketing Strategy", count: 47 },
  { name: "Sales Enablement", count: 38 },
  { name: "Customer Success", count: 42 },
  { name: "Product Management", count: 35 },
];
