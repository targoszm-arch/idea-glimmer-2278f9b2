/**
 * Strips editor artifacts, <style> tags, and normalises whitespace
 * before publishing content to external platforms.
 */
export function cleanContentForPublish(html: string): string {
  if (!html) return "";
  return html
    // Remove <style> blocks
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Remove data- attributes (editor artifacts)
    .replace(/\s+data-[a-z-]+="[^"]*"/gi, "")
    // Collapse multiple blank lines
    .replace(/(\s*\n){3,}/g, "\n\n")
    .trim();
}
