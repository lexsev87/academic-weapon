import type { SVGProps } from 'react';

/* Thin line icons in the spirit of SF Symbols. */
type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 16, p: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

export const IconHome = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 10.2L12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.2v-6h-5.6v6H5A1.5 1.5 0 0 1 3.5 19z" />
  </svg>
);
export const IconTimer = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.6 1.8M9.5 2.5h5M18.5 6l1.3-1.3" />
  </svg>
);
export const IconList = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11" />
    <circle cx="4.6" cy="6.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.6" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.6" cy="17.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const IconCap = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M2 9.5L12 5l10 4.5L12 14z" />
    <path d="M6 11.5v4.3c0 1.5 2.7 3.2 6 3.2s6-1.7 6-3.2v-4.3M22 9.5v5" />
  </svg>
);
export const IconChart = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="12" width="4" height="8" rx="1" />
    <rect x="10" y="4" width="4" height="16" rx="1" />
    <rect x="16.5" y="8.5" width="4" height="11.5" rx="1" />
  </svg>
);
export const IconSettings = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconPlay = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} stroke="none" fill="currentColor">
    <path d="M7.5 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L9 3.94a1 1 0 0 0-1.5.86z" />
  </svg>
);
export const IconPause = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} stroke="none" fill="currentColor">
    <rect x="6" y="4.5" width="4" height="15" rx="1.3" />
    <rect x="14" y="4.5" width="4" height="15" rx="1.3" />
  </svg>
);
export const IconSkip = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M5.5 5l9.5 7-9.5 7zM18.5 5.5v13" />
  </svg>
);
export const IconStop = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)} stroke="none" fill="currentColor">
    <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />
  </svg>
);
export const IconReset = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5M4 4v4.5h4.5" />
  </svg>
);
export const IconPlus = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconMinus = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2}>
    <path d="M5 12h14" />
  </svg>
);
export const IconTrash = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 6.5h16M9 6.5V4.5h6v2M6.5 6.5l.9 13a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13M10 10.5v6M14 10.5v6" />
  </svg>
);
export const IconEdit = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
  </svg>
);
export const IconX = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);
export const IconExpand = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const IconDownload = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3.5v11.5M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />
  </svg>
);
export const IconUpload = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 15V3.5M7.5 8L12 3.5 16.5 8M4.5 19.5h15" />
  </svg>
);
export const IconCalendar = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const IconChevron = ({ size = 14, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2}>
    <path d="M9 5.5l6.5 6.5L9 18.5" />
  </svg>
);
export const IconCheck = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.2}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const IconChat = ({ size = 16, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h-1A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5z" />
  </svg>
);
