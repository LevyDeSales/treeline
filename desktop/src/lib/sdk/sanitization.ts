/**
 * Custom HTML sanitization utility.
 *
 * This module provides a simple, whitelist-based HTML sanitization function
 * using DOMParser. It's used to prevent XSS when rendering external content
 * like release notes and plugin READMEs.
 *
 * NOTE: Industry-standard libraries like DOMPurify are preferred, but
 * in this network-restricted environment, this custom implementation
 * provides essential protection against common XSS vectors.
 */

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u", "s", "del", "ins",
  "code", "pre",
  "a", "img",
  "span", "div",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "blockquote", "cite", "q",
]);

const ALLOWED_ATTRIBUTES = new Set([
  "href", "src", "alt", "title", "class", "target", "rel", "id", "width", "height"
]);

const BLOCKED_PROTOCOLS = [
  "javascript:",
  "vbscript:",
  "data:",
  "file:",
];

/**
 * Sanitizes an HTML string against a whitelist of tags and attributes.
 *
 * @param html - The HTML string to sanitize.
 * @returns The sanitized HTML string.
 */
export function sanitizeHtml(html: string): string {
  // Fail-safe: if DOMParser is not available, return empty string
  // instead of unsanitized HTML.
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return "";
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const container = document.createElement("div");

    // Sanitize all children of the body
    for (let i = 0; i < doc.body.childNodes.length; i++) {
      const cleanChild = sanitizeNode(doc.body.childNodes[i]);
      if (cleanChild) {
        container.appendChild(cleanChild);
      }
    }

    return container.innerHTML;
  } catch (e) {
    console.error("Sanitization failed:", e);
    return "";
  }
}

/**
 * Recursively sanitizes a DOM node.
 */
function sanitizeNode(node: Node): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    // TEXT_NODE is inherently safe when handled via textContent
    return document.createTextNode(node.textContent || "");
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tagName = el.tagName.toLowerCase();

    // If tag is not allowed, we don't render it.
    // Instead of skipping entirely, we render its text content to avoid
    // losing information while preventing tag-based attacks.
    if (!ALLOWED_TAGS.has(tagName)) {
      return document.createTextNode(el.textContent || "");
    }

    const cleanEl = document.createElement(tagName);

    // Copy allowed attributes
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      const attrName = attr.name.toLowerCase();

      if (ALLOWED_ATTRIBUTES.has(attrName)) {
        let attrValue = attr.value;

        // Protocol checks for href and src to block script injection
        if (attrName === "href" || attrName === "src") {
          const lowerValue = attrValue.trim().toLowerCase();
          if (BLOCKED_PROTOCOLS.some(p => lowerValue.startsWith(p))) {
            attrValue = "#";
          }
        }

        cleanEl.setAttribute(attrName, attrValue);
      }
    }

    // Security best practice: rel="noopener noreferrer" for target="_blank"
    // to prevent tabnabbing.
    if (tagName === "a" && cleanEl.getAttribute("target") === "_blank") {
      cleanEl.setAttribute("rel", "noopener noreferrer");
    }

    // Recursively sanitize and append children
    for (let i = 0; i < el.childNodes.length; i++) {
      const cleanChild = sanitizeNode(el.childNodes[i]);
      if (cleanChild) {
        cleanEl.appendChild(cleanChild);
      }
    }

    return cleanEl;
  }

  // Skip comments and other node types (e.g., CDATA, processing instructions)
  return null;
}
