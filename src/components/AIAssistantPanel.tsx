import { useState } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { streamAI } from "@/lib/ai-stream";
import { toast } from "@/hooks/use-toast";

interface AIAssistantPanelProps {
  currentContent: string;
  onApplyContent: (content: string) => void;
}

const AIAssistantPanel = ({ currentContent, onApplyContent }: AIAssistantPanelProps) => {
  const [instruction, setInstruction] = useState("");
  const [preview, setPreview] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const quickActions = [
    "Make it more conversational",
    "Add more examples",
    "Make it shorter",
    "Improve SEO",
    "Add a conclusion",
  ];

  const handleImprove = async (customInstruction?: string) => {
    const inst = customInstruction || instruction;
    if (!inst.trim()) return;

    setIsStreaming(true);
    setPreview("");
    let accumulated = "";

    await streamAI({
      functionName: "improve-article",
      body: { content: currentContent, instruction: inst },
      onDelta: (text) => {
        accumulated += text;
        setPreview(accumulated);
      },
      onDone: () => {
        setIsStreaming(false);
      },
      onError: (error) => {
        setIsStreaming(false);
        toast({ title: "AI Error", description: error, variant: "destructive" });
      },
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        AI Assistant
      </div>

      <div className="flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <button
            key={action}
            onClick={() => handleImprove(action)}
            disabled={isStreaming || !currentContent}
            className="rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            {action}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleImprove()}
          placeholder="Custom instruction..."
          disabled={isStreaming}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          onClick={() => handleImprove()}
          disabled={isStreaming || !instruction.trim()}
          className="rounded-lg bg-primary p-2 text-primary-foreground transition-transform hover:scale-105 disabled:opacity-50"
        >
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-secondary/30 p-3 text-sm text-foreground">
            <div dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
          <button
            onClick={() => {
              onApplyContent(preview);
              setPreview("");
              setInstruction("");
            }}
            disabled={isStreaming}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-50"
          >
            Apply Changes
          </button>
        </div>
      )}
    </div>
  );
};

export default AIAssistantPanel;
