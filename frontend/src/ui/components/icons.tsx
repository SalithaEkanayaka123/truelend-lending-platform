/** Hand-built SVG icons (no icon library, ui_spec §4.4). 24x24 viewBox,
 * stroked with `currentColor` so they follow the surrounding text colour, and
 * decorative: the text beside each icon carries the meaning. */

import type { JSX, ReactNode } from 'react';

export interface IconProps {
  size?: number;
}

function Svg({ size = 24, children }: IconProps & { children: ReactNode }): JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Logo mark: a rounded square holding an ascending bar pair. */
export function BrandMark({ size = 28 }: IconProps): JSX.Element {
  return (
    <Svg size={size}>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" stroke="none" opacity="0.18" />
      <path d="M8 16V12" />
      <path d="M12 16V8" />
      <path d="M16 16v-6" />
    </Svg>
  );
}

export function ApplicationsIcon({ size }: IconProps): JSX.Element {
  return (
    <Svg size={size}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M10 12h5" />
      <path d="M10 16h5" />
    </Svg>
  );
}

export function QueueIcon({ size }: IconProps): JSX.Element {
  return (
    <Svg size={size}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <circle cx="19" cy="17" r="2" />
    </Svg>
  );
}

export function PolicyIcon({ size }: IconProps): JSX.Element {
  return (
    <Svg size={size}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function AuditIcon({ size }: IconProps): JSX.Element {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
      <path d="M9 11h4" />
    </Svg>
  );
}
