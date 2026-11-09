// Purely decorative, hand-drawn SVG elements + animated background orbs.
// Every export is aria-hidden, non-interactive and sits behind the content.

type SvgProps = { className?: string };

function svgProps(className: string) {
  return {
    className,
    "aria-hidden": true as const,
    focusable: "false" as const,
    viewBox: "0 0 120 120",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  };
}

/** A quill with a small ink drop. */
export function Quill({ className }: SvgProps) {
  return (
    <svg {...svgProps(className ?? "")}>
      <path
        d="M22 98c30-6 56-24 72-74"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M94 24c-14 4-30 12-40 22-9 9-14 18-16 24 8-2 18-7 27-15 8-8 22-22 29-31z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M38 70l14 14" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="20" cy="102" r="4" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

/** A stack of three books. */
export function Books({ className }: SvgProps) {
  return (
    <svg {...svgProps(className ?? "")}>
      <rect x="18" y="78" width="84" height="20" rx="4" stroke="currentColor" strokeWidth="3.5" />
      <rect x="26" y="52" width="68" height="20" rx="4" stroke="currentColor" strokeWidth="3.5" />
      <rect x="34" y="26" width="52" height="20" rx="4" stroke="currentColor" strokeWidth="3.5" />
      <path d="M30 62h30M38 36h20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M72 88h22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A lightbulb with rays. */
export function Lightbulb({ className }: SvgProps) {
  return (
    <svg {...svgProps(className ?? "")}>
      <path
        d="M60 22a20 20 0 0 0-12 36c3 2 4 5 4 8v6h16v-6c0-3 1-6 4-8a20 20 0 0 0-12-36z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M52 80h16M55 90h10" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      <path
        d="M60 8v8M34 20l6 6M86 20l-6 6M24 46h8M88 46h8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A folded sheet of paper with lines of text. */
export function PaperSheet({ className }: SvgProps) {
  return (
    <svg {...svgProps(className ?? "")}>
      <path
        d="M30 18h44l16 16v68H30z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M74 18v16h16" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
      <path
        d="M42 50h36M42 62h36M42 74h24"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Two overlapping speech bubbles. */
export function SpeechBubbles({ className }: SvgProps) {
  return (
    <svg {...svgProps(className ?? "")}>
      <path
        d="M20 30h56a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H44l-14 12V72h-10a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M52 60h40a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H70l-10 10V90h-8a6 6 0 0 1-6-6V66a6 6 0 0 1 6-6z"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M34 46h28M64 74h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Slow drifting blurred gradient orbs. Rendered once per page, fixed behind
 * everything (pointer-events-none, no interactivity).
 */
export function Orbs() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ filter: "saturate(140%)" }}
    >
      <div
        className="orb orb-purple absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full"
        style={{ background: "radial-gradient(circle at 35% 35%, rgba(168,85,247,0.55), rgba(168,85,247,0) 70%)" }}
      />
      <div
        className="orb orb-blue absolute top-1/3 -right-32 h-[30rem] w-[30rem] rounded-full"
        style={{ background: "radial-gradient(circle at 40% 40%, rgba(59,130,246,0.5), rgba(59,130,246,0) 70%)" }}
      />
      <div
        className="orb orb-indigo absolute -bottom-40 left-1/4 h-[26rem] w-[26rem] rounded-full"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(99,102,241,0.45), rgba(99,102,241,0) 70%)" }}
      />
    </div>
  );
}
