

## Fix vertical video rendering on published site

### Problem
When a portrait/vertical video is inserted into an article and published to Framer, the `<video>` tag has `style="max-width:100%;height:auto;"` which forces the container to full width. A vertical video doesn't fill the horizontal space, creating a large grey area on the right (visible in your screenshot).

### Root cause
In `src/components/EditorToolbar.tsx` line 97, the inline style `max-width:100%;height:auto;` tells the browser to stretch the video element to 100% of the container width. For portrait videos, the actual content is centered within that stretched element, leaving dead space.

### Fix
Update the inline style on the inserted `<video>` tag to properly handle both landscape and portrait videos:

**`src/components/EditorToolbar.tsx`** — Change the video insert template:
```html
<video controls src="${url}" 
  style="display:block;max-width:100%;max-height:80vh;height:auto;width:auto;margin:0 auto;">
</video>
```

Key style changes:
- `width:auto` — lets portrait videos take their natural width instead of stretching to 100%
- `max-height:80vh` — prevents excessively tall portrait videos from overwhelming the page
- `display:block;margin:0 auto` — centers the video horizontally
- `max-width:100%` — still caps landscape videos to container width

### Important note
This fix applies to **newly inserted videos only**. Already-published articles on `training.skillstudio.ai` will retain the old inline styles. To fix existing content, you would need to either:
1. Re-insert the video in the editor and re-publish, or
2. Add CSS on the Framer side to override video element styling (e.g., `video { width:auto; max-height:80vh; margin:0 auto; display:block; }`)

