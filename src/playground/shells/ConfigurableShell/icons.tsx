import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function SlidersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 4.5h11" />
      <path d="M2.5 8h11" />
      <path d="M2.5 11.5h11" />
      <circle cx="6" cy="4.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="7.5" cy="11.5" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ResetIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.2 8a4.8 4.8 0 1 0 1.15-3.15" />
      <path d="M3.2 2.8v3.1h3.1" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5.4" y="5.4" width="8" height="8" rx="1.5" />
      <path d="M10.6 5.2V4.2A1.4 1.4 0 0 0 9.2 2.8H4.2A1.4 1.4 0 0 0 2.8 4.2v5a1.4 1.4 0 0 0 1.4 1.4h1" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.2 8.2 6.4 11.3 12.8 4.7" />
    </svg>
  );
}

export function MoveIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M8 2.4v11.2M2.4 8h11.2" />
      <path d="M8 2.4 6.3 4.1M8 2.4 9.7 4.1M8 13.6 6.3 11.9M8 13.6 9.7 11.9M2.4 8 4.1 6.3M2.4 8 4.1 9.7M13.6 8 11.9 6.3M13.6 8 11.9 9.7" />
    </svg>
  );
}

export function ExpandIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9.7 3.2h3.1v3.1M6.3 12.8H3.2v-3.1M12.8 3.2 9.2 6.8M3.2 12.8 6.8 9.2" />
    </svg>
  );
}
