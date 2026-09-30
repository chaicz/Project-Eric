import React, { useState, useEffect } from 'react';

/**
 * Animated background slideshow using background1.jpg - background12.jpg
 * Features:
 *  - Cross-fades between 12 abstract blue/tech themed images
 *  - Subtle Ken Burns (slow zoom) effect per slide
 *  - Soft dark overlay so foreground content stays readable
 *  - Optional vignette + grain overlay
 *  - Optional fixed-position variant for full-page coverage
 */
const BackgroundSlideshow = ({
  images = [
    '/background1.jpg',
    '/background2.jpg',
    '/background3.jpg',
    '/background4.jpg',
    '/background5.jpg',
    '/background6.jpg',
    '/background7.jpg',
    '/background9.jpg',
    '/background10.jpg',
    '/background11.jpg',
    '/background12.jpg',
  ],
  interval = 5000,
  overlayOpacity = 0.55,
  fixed = true,
  showIndicators = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!images || images.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % images.length);
    }, interval);
    return () => clearInterval(timer);
  }, [images, interval]);

  return (
    <div
      className={`${fixed ? 'fixed' : 'absolute'} inset-0 overflow-hidden pointer-events-none ${
        fixed ? 'z-0' : ''
      }`}
      aria-hidden="true"
    >
      {/* Stacked images, cross-faded */}
      {images.map((src, i) => (
        <div
          key={src}
          className={`absolute inset-0 bg-no-repeat bg-cover bg-center transition-opacity duration-[1500ms] ease-in-out ${
            i === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: `url(${src})`,
            transform: i === currentIndex ? 'scale(1.08)' : 'scale(1.0)',
            transition:
              'opacity 1500ms ease-in-out, transform 8000ms ease-out',
          }}
        />
      ))}

      {/* Dark/blue gradient overlay - keeps foreground readable */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, rgba(15, 23, 42, ${overlayOpacity}) 0%, rgba(30, 41, 59, ${overlayOpacity * 0.85}) 50%, rgba(15, 23, 42, ${overlayOpacity}) 100%)`,
          mixBlendMode: 'multiply',
        }}
      />

      {/* Subtle blue tint */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(59, 130, 246, 0.15) 0%, transparent 60%), radial-gradient(ellipse at bottom, rgba(139, 92, 246, 0.1) 0%, transparent 60%)',
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 40%, rgba(15, 23, 42, 0.4) 100%)',
        }}
      />

      {/* Optional indicator dots */}
      {showIndicators && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === currentIndex
                  ? 'w-8 bg-white/80'
                  : 'w-1.5 bg-white/30 hover:bg-white/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default BackgroundSlideshow;