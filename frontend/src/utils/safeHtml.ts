import DOMPurify from 'dompurify';
export const safeHtml = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'ol', 'ul', 'li', 'a'],
  ALLOWED_ATTR: ['href', 'title'], ALLOW_DATA_ATTR: false,
}).replace(/<(\/?)(h1)(?=[\s>])/gi, '<$1h2');
