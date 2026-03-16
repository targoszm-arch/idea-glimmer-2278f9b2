import { useRef, useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Undo,
  Redo,
  Quote,
  Code,
  Minus,
  ImagePlus,
  Video,
  Loader2,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import InfographicDialog from "./InfographicDialog";

interface EditorToolbarProps {
  editor: Editor | null;
}

const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [infographicOpen, setInfographicOpen] = useState(false);

  // Subscribe to editor state changes so isActive() re-evaluates on every transaction
  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isBold: e?.isActive("bold") ?? false,
      isItalic: e?.isActive("italic") ?? false,
      isH1: e?.isActive("heading", { level: 1 }) ?? false,
      isH2: e?.isActive("heading", { level: 2 }) ?? false,
      isH3: e?.isActive("heading", { level: 3 }) ?? false,
      isBulletList: e?.isActive("bulletList") ?? false,
      isOrderedList: e?.isActive("orderedList") ?? false,
      isBlockquote: e?.isActive("blockquote") ?? false,
      isCodeBlock: e?.isActive("codeBlock") ?? false,
      isLink: e?.isActive("link") ?? false,
    }),
  });

  if (!editor) return null;

  const btnClass = (active: boolean, disabled = false) =>
    `rounded-md p-2 transition-colors ${
      disabled ? "opacity-50 cursor-not-allowed" :
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("upload-article-media", {
        body: {
          file_base64: base64,
          file_name: file.name,
          content_type: file.type,
        },
      });
      if (error) throw error;
      return data.url;
    } catch (e) {
      console.error("Upload failed:", e);
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
      return null;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    const url = await uploadFile(file);
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
    setIsUploadingImage(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingVideo(true);
    const url = await uploadFile(file);
    if (url) {
      // Insert as HTML5 video tag so it renders in Intercom/Framer as standard HTML
      editor.chain().focus().insertContent(
        `<p><video controls src="${url}" style="max-width:100%;height:auto;"></video></p>`
      ).run();
    }
    setIsUploadingVideo(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const setLink = () => {
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary px-3 py-2 rounded-t-xl sticky top-0 z-40 shadow-sm">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editorState.isBold)}>
        <Bold className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editorState.isItalic)}>
        <Italic className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editorState.isH1)}>
        <Heading1 className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editorState.isH2)}>
        <Heading2 className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editorState.isH3)}>
        <Heading3 className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editorState.isBulletList)}>
        <List className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editorState.isOrderedList)}>
        <ListOrdered className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editorState.isBlockquote)}>
        <Quote className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editorState.isCodeBlock)}>
        <Code className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)}>
        <Minus className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={setLink} className={btnClass(editor.isActive("link"))}>
        <LinkIcon className="h-4 w-4" />
      </button>

      {/* Image upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
      <button
        onClick={() => imageInputRef.current?.click()}
        className={btnClass(false, isUploadingImage)}
        disabled={isUploadingImage}
        title="Upload Image"
      >
        {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </button>

      {/* Video upload */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoUpload}
      />
      <button
        onClick={() => videoInputRef.current?.click()}
        className={btnClass(false, isUploadingVideo)}
        disabled={isUploadingVideo}
        title="Upload Video"
      >
        {isUploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
      </button>

      {/* Infographic */}
      <button
        onClick={() => setInfographicOpen(true)}
        className={btnClass(false)}
        title="Insert Infographic"
      >
        <BarChart3 className="h-4 w-4" />
      </button>

      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)} disabled={!editor.can().undo()}>
        <Undo className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)} disabled={!editor.can().redo()}>
        <Redo className="h-4 w-4" />
      </button>

      <InfographicDialog open={infographicOpen} onOpenChange={setInfographicOpen} editor={editor} />
    </div>
  );
};

export default EditorToolbar;
