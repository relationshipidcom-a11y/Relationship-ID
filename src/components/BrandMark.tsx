import React from 'react';

interface BrandMarkProps {
  size?: number | string;
  className?: string;
  alt?: string;
  isDecorative?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 30,
  className = '',
  alt = 'Relationship ID Logo',
  isDecorative = false
}) => {
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <img
      src="/brand/relationship-id-logo.svg"
      alt={isDecorative ? '' : alt}
      aria-hidden={isDecorative ? 'true' : undefined}
      style={{
        width: dimension,
        height: dimension,
        objectFit: 'contain'
      }}
      className={`inline-block flex-shrink-0 select-none ${className}`}
    />
  );
};

export default BrandMark;
