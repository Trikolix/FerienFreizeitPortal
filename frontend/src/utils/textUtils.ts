export const stripHtmlAndTruncate = (html: string, wordLimit: number = 30) => {
  if (!html) return { text: '', truncated: false };
  
  // Replace line-breaking tags with spaces
  const cleanHtml = html.replace(/<(br|p|div|li|h[1-6])[^>]*>/gi, ' ');
  
  const doc = new DOMParser().parseFromString(cleanHtml, 'text/html');
  const text = doc.body.textContent || "";
  const words = text.split(/\s+/).filter(Boolean);
  
  if (words.length <= wordLimit) {
    return { text: text.trim(), truncated: false };
  }
  
  return { 
    text: words.slice(0, wordLimit).join(' ').trim() + '...', 
    truncated: true 
  };
};
