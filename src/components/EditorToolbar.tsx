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
  onUnsplash?: () => void;
}

const EditorToolbar = ({ editor, onUnsplash }: EditorToolbarProps) => {
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

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      console.log("[video-upload] starting storage upload", file.name, file.size, file.type);
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
      const uniqueName = `content/media-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("article-covers")
        .upload(uniqueName, file, { contentType: file.type, upsert: false });

      console.log("[video-upload] storage result", { uploadData, uploadError });

      if (uploadError) {
        const msg = (uploadError as any).message || JSON.stringify(uploadError);
        toast({ title: "Upload failed", description: msg, variant: "destructive" });
        return null;
      }

      const { data: urlData } = supabase.storage
        .from("article-covers")
        .getPublicUrl(uniqueName);

      console.log("[video-upload] public URL", urlData.publicUrl);
      return urlData.publicUrl;
    } catch (e) {
      console.error("[video-upload] caught exception:", e);
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
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
    console.log("[video-upload] handleVideoUpload called", e.target.files);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum video size is 50 MB.", variant: "destructive" });
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }
    setIsUploadingVideo(true);
    toast({ title: "Uploading video…", description: `${(file.size / 1024 / 1024).toFixed(1)} MB — please wait.` });
    const url = await uploadFile(file);
    if (url) {
      editor.chain().focus().insertContent({ type: "video", attrs: { src: url } }).run();
      toast({ title: "Video added to article" });
    } else {
      toast({ title: "Upload failed", description: "No URL returned from storage.", variant: "destructive" });
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
      <button onClick={setLink} className={btnClass(editorState.isLink)}>
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
      {onUnsplash && (
        <button
          onClick={onUnsplash}
          className={btnClass(false)}
          title="Insert from Unsplash"
        >
          <svg className="h-4 w-4" viewBox="0 0 32 32" fill="currentColor"><path d="M10 9V0h12v9H10zm12 5h10v18H0V14h10v9h12v-9z"/></svg>
        </button>
      )}

      {/* Video upload — label wraps the input so the click always fires onChange */}
      <label
        className={btnClass(false, isUploadingVideo) + " cursor-pointer"}
        title="Upload Video (MP4, max 50 MB)"
      >
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/ogg,video/*"
          className="hidden"
          onChange={handleVideoUpload}
          disabled={isUploadingVideo}
        />
        {isUploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
      </label>

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
