import { useState } from "react";
import { Editor } from "@tiptap/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Sparkles, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { generateTemplate, templateTypes, type TemplateItem, type TemplateType } from "@/lib/infographic-templates";

const sampleData: Record<TemplateType, TemplateItem[]> = {
  stats: [
    { label: "Revenue", value: "$2.4M" },
    { label: "Users", value: "12,500" },
    { label: "Growth", value: "+34%" },
    { label: "NPS Score", value: "72" },
  ],
  comparison: [
    { label: "Option A", value: "Enterprise", description: "Full-featured solution" },
    { label: "Option B", value: "Startup", description: "Lightweight alternative" },
  ],
  timeline: [
    { label: "Research", value: "Identify the problem" },
    { label: "Design", value: "Create the solution" },
    { label: "Build", value: "Implement & test" },
    { label: "Launch", value: "Ship to production" },
  ],
  process: [
    { label: "Input", value: "Gather data" },
    { label: "Process", value: "Analyze" },
    { label: "Output", value: "Report" },
    { label: "Review", value: "Iterate" },
  ],
};

interface InfographicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: Editor;
}

const defaultItems: TemplateItem[] = [
  { label: "Label 1", value: "Value 1", description: "" },
  { label: "Label 2", value: "Value 2", description: "" },
  { label: "Label 3", value: "Value 3", description: "" },
  { label: "Label 4", value: "Value 4", description: "" },
];

const InfographicDialog = ({ open, onOpenChange, editor }: InfographicDialogProps) => {
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState("general");
  const [isGenerating, setIsGenerating] = useState(false);

  const [templateType, setTemplateType] = useState<TemplateType>("stats");
  const [items, setItems] = useState<TemplateItem[]>(defaultItems);

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-infographic", {
        body: { prompt: aiPrompt, style: aiStyle },
      });
      if (error) throw error;
      if (data?.image_url) {
        editor.chain().focus().setImage({ src: data.image_url }).run();
        onOpenChange(false);
        toast({ title: "Infographic inserted" });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Generation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertTemplate = () => {
    const validItems = items.filter(i => i.label.trim() && i.value.trim());
    if (validItems.length === 0) {
      toast({ title: "Add at least one item", variant: "destructive" });
      return;
    }
    const html = generateTemplate(templateType, validItems);
    editor.chain().focus().insertContent(html).run();
    onOpenChange(false);
    toast({ title: "Infographic inserted" });
  };

  const updateItem = (index: number, field: keyof TemplateItem, value: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [...prev, { label: "", value: "", description: "" }]);
  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Insert Infographic</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="ai" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai">AI Generate</TabsTrigger>
            <TabsTrigger value="template">HTML Template</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Describe the infographic you want, e.g. 'Compare features of React vs Vue vs Angular'"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Style</Label>
              <Select value={aiStyle} onValueChange={setAiStyle}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="comparison">Comparison</SelectItem>
                  <SelectItem value="stats">Statistics</SelectItem>
                  <SelectItem value="timeline">Timeline</SelectItem>
                  <SelectItem value="process">Process Flow</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAiGenerate} disabled={isGenerating || !aiPrompt.trim()} className="w-full">
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {isGenerating ? "Generating…" : "Generate Infographic"}
            </Button>
          </TabsContent>

          <TabsContent value="template" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Choose a Template</Label>
              <div className="grid grid-cols-2 gap-3">
                {templateTypes.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTemplateType(t.key)}
                    className={`relative text-left border rounded-lg p-3 transition-all hover:shadow-md ${
                      templateType === t.key
                        ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                        : "border-border bg-card hover:border-muted-foreground/30"
                    }`}
                  >
                    {templateType === t.key && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <div className="text-sm font-semibold text-foreground mb-1">{t.label}</div>
                    <div className="text-xs text-muted-foreground mb-2">{t.description}</div>
                    <div
                      className="rounded border border-border bg-background p-2 overflow-hidden max-h-[120px] pointer-events-none"
                      style={{ transform: "scale(0.65)", transformOrigin: "top left", width: "154%", marginBottom: "-45px" }}
                      dangerouslySetInnerHTML={{ __html: generateTemplate(t.key, sampleData[t.key]) }}
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Items</Label>
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="Label"
                      value={item.label}
                      onChange={(e) => updateItem(i, "label", e.target.value)}
                    />
                    <Input
                      placeholder="Value"
                      value={item.value}
                      onChange={(e) => updateItem(i, "value", e.target.value)}
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(i)} className="mt-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addItem} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Preview</Label>
              <div
                className="border border-border rounded-lg p-4 bg-background overflow-auto max-h-[200px]"
                dangerouslySetInnerHTML={{ __html: generateTemplate(templateType, items.filter(i => i.label.trim() && i.value.trim())) }}
              />
            </div>

            <Button onClick={handleInsertTemplate} className="w-full">
              Insert into Article
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default InfographicDialog;
