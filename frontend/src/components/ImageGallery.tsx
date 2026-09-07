import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trees } from 'lucide-react';
import type { ImageMetadata } from '../utils/imageMetadata';

export function ImageGallery({ images = [], metadata = [], title = 'Freizeit' }: { images?: string[]; metadata?: ImageMetadata[]; title?: string }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return <div className="camp-media-fallback" aria-hidden="true"><Trees size={48} strokeWidth={1.2} /><span>Draußen. Zusammen. Erleben.</span></div>;
  const current = Math.min(index, images.length - 1);
  const description = metadata.find(image => image.image_url === images[current]);
  const alt = description?.is_decorative ? '' : description?.alt_text || 'Bildbeschreibung noch nicht hinterlegt';
  return <div className="image-gallery" role="group" aria-label={`Bilder zu ${title}`}>
    <img src={images[current]} alt={alt} />
    {images.length > 1 && <div className="gallery-controls">
      <button type="button" onClick={() => setIndex((current + images.length - 1) % images.length)} aria-label="Vorheriges Bild"><ChevronLeft aria-hidden="true" /></button>
      <span role="status" aria-atomic="true">Bild {current + 1} von {images.length}</span>
      <button type="button" onClick={() => setIndex((current + 1) % images.length)} aria-label="Nächstes Bild"><ChevronRight aria-hidden="true" /></button>
    </div>}
  </div>;
}
