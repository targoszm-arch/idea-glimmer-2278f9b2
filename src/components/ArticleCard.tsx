import { Link } from "react-router-dom";
import { Calendar, Edit3, ExternalLink, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Article } from "@/lib/supabase";

interface ArticleCardProps {
  article: Article;
}

const ArticleCard = ({ article }: ArticleCardProps) => {
  const date = new Date(article.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge
            variant={article.status === "published" ? "default" : "secondary"}
            className="text-xs"
          >
            {article.status}
          </Badge>
          {(article as any).source === "automation" && (
            <Badge variant="outline" className="text-xs text-purple-600 border-purple-200 bg-purple-50 gap-1">
              <Zap className="w-2.5 h-2.5" /> Auto
            </Badge>
          )}
        </div>
        {article.category && (
          <span className="text-xs font-medium text-muted-foreground">
            {article.category}
          </span>
        )}
      </div>

      <h3 className="mb-2 text-lg font-bold text-foreground line-clamp-2">
        {article.title || "Untitled"}
      </h3>

      {article.excerpt && (
        <p className="mb-4 text-sm text-muted-foreground line-clamp-3">
          {article.excerpt}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {date}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/article/${article.id}`}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Preview
          </Link>
          <Link
            to={`/edit/${article.id}`}
            className="flex items-center gap-1 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <Edit3 className="h-3 w-3" />
            Edit
          </Link>
        </div>
      </div>
      {(article as any).wp_permalink && (
        <a href={(article as any).wp_permalink} target="_blank" rel="noreferrer"
          className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline"
          onClick={e => e.stopPropagation()}>
          <ExternalLink className="w-3 h-3" /> View on WordPress
        </a>
      )}
    </div>
  );
};

export default ArticleCard;
