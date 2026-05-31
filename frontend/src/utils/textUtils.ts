export const stripHtmlAndTruncate = (html: string, wordLimit: number = 30) => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body.textContent || "";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= wordLimit) return text;
  return words.slice(0, wordLimit).join(' ') + '...';
};
