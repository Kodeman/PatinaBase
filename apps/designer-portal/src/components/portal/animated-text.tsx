'use client';

import { type ElementType, type HTMLAttributes } from 'react';

interface AnimatedTextProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  children: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  delay?: number;
  mode?: 'line' | 'words';
}

export function AnimatedText({
  children,
  as: Tag = 'div',
  delay = 0,
  mode = 'line',
  className = '',
  style,
  ...rest
}: AnimatedTextProps) {
  if (mode === 'words') {
    const words = children.split(/\s+/);
    return (
      <Tag className={className} style={style} {...rest}>
        {words.map((word, i) => (
          <span
            key={`${word}-${i}`}
            className="inline-block animate-text-reveal"
            style={{ animationDelay: `${delay + i * 50}ms` }}
          >
            {word}
            {i < words.length - 1 ? '\u00A0' : ''}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <div className="overflow-hidden">
      <Tag
        className={`animate-text-reveal ${className}`}
        style={{ animationDelay: `${delay}ms`, ...style }}
        {...rest}
      >
        {children}
      </Tag>
    </div>
  );
}
