import { Node, mergeAttributes } from "@tiptap/core";

export const VideoExtension = Node.create({
  name: "video",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes({ controls: true, style: "max-width:100%;height:auto;" }, HTMLAttributes),
    ];
  },
});
