import { Editor } from "@tiptap/react";
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
} from "lucide-react";

interface EditorToolbarProps {
  editor: Editor | null;
}

const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `rounded-md p-2 transition-colors ${
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
    }`;

  const setLink = () => {
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertImage = () => {
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const insertVideo = () => {
    const url = window.prompt("Enter YouTube video URL:");
    if (url) {
      editor.commands.setYoutubeVideo({ src: url });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border bg-secondary/30 px-3 py-2 rounded-t-lg">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"))}>
        <Bold className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"))}>
        <Italic className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editor.isActive("heading", { level: 1 }))}>
        <Heading1 className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editor.isActive("heading", { level: 2 }))}>
        <Heading2 className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editor.isActive("heading", { level: 3 }))}>
        <Heading3 className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>
        <List className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>
        <ListOrdered className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>
        <Quote className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive("codeBlock"))}>
        <Code className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btnClass(false)}>
        <Minus className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={setLink} className={btnClass(editor.isActive("link"))}>
        <LinkIcon className="h-4 w-4" />
      </button>
      <button onClick={insertImage} className={btnClass(editor.isActive("image"))} title="Insert Image">
        <ImagePlus className="h-4 w-4" />
      </button>
      <button onClick={insertVideo} className={btnClass(editor.isActive("youtube"))} title="Insert YouTube Video">
        <Video className="h-4 w-4" />
      </button>
      <div className="mx-1 h-6 w-px bg-border" />
      <button onClick={() => editor.chain().focus().undo().run()} className={btnClass(false)} disabled={!editor.can().undo()}>
        <Undo className="h-4 w-4" />
      </button>
      <button onClick={() => editor.chain().focus().redo().run()} className={btnClass(false)} disabled={!editor.can().redo()}>
        <Redo className="h-4 w-4" />
      </button>
    </div>
  );
};

export default EditorToolbar;
