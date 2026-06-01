import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react';

interface ImageGalleryProps {
  images?: string[];
  title?: string;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images, title }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (!images || images.length === 0) {
    return (
      <div className="camp-media-fallback">
        <MapPin size={42} />
      </div>
    );
  }

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className="image-gallery">
      <AnimatePresence mode="wait">
        <motion.img
          key={currentIndex}
          src={images[currentIndex]}
          alt={`${title || 'Freizeit'} - Bild ${currentIndex + 1}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        />
      </AnimatePresence>

      {images.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="gallery-nav prev"
            aria-label="Vorheriges Bild"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={handleNext}
            className="gallery-nav next"
            aria-label="Nächstes Bild"
          >
            <ChevronRight size={24} />
          </button>

          <div className="gallery-dots">
            {images.map((_, index) => (
              <button
                key={index}
                className={index === currentIndex ? 'is-active' : ''}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentIndex(index); }}
                aria-label={`Gehe zu Bild ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
