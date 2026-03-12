import { useState, useEffect } from "react";
import { Plus, X, Tag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

interface CategoryPickerProps {
  value: string;
  onChange: (value: string) => void;
}

const CategoryPicker = ({ value, onChange }: CategoryPickerProps) => {
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  useEffect(() => {
    fetchLabels();
  }, []);

  const fetchLabels = async () => {
    const { data } = await supabase
      .from("category_labels")
      .select("id, name")
      .order("name");
    if (data) setLabels(data);
  };

  const handleAdd = async () => {
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    if (labels.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
      toast({ title: "Label already exists", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase
      .from("category_labels")
      .insert({ name: trimmed })
      .select("id, name")
      .single();
    if (error) {
      toast({ title: "Failed to create label", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setLabels((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      onChange(data.name);
    }
    setNewLabel("");
    setIsAdding(false);
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label) => {
          const isSelected = value === label.name;
          return (
            <button
              key={label.id}
              type="button"
              onClick={() => onChange(isSelected ? "" : label.name)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              }`}
            >
              <Tag className="h-3 w-3" />
              {label.name}
            </button>
          );
        })}
        {isAdding ? (
          <div className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") { setIsAdding(false); setNewLabel(""); }
              }}
              placeholder="New label..."
              className="h-7 w-28 rounded-full border border-input bg-background px-2.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-full bg-primary p-1 text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => { setIsAdding(false); setNewLabel(""); }}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>
    </div>
  );
};

export default CategoryPicker;
