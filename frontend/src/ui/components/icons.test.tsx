import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ApplicationsIcon, AuditIcon, BrandMark, PolicyIcon, QueueIcon } from './icons';

const ICONS = { BrandMark, ApplicationsIcon, QueueIcon, PolicyIcon, AuditIcon };

describe('hand-built SVG icons', () => {
  afterEach(() => {
    cleanup();
  });

  it.each(Object.entries(ICONS))('%s is a decorative svg that follows the text colour', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('accepts a size', () => {
    const { container } = render(<PolicyIcon size={40} />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '40');
  });
});
