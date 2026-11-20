/** Minimal 20px stroke icons for the viewer controls (no icon library in this app). */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const ResetIcon = () => (
  <Icon>
    <path d="M4 10a6 6 0 1 0 1.8-4.3" />
    <path d="M4 3.5v3h3" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <path d="M7.5 5v10M12.5 5v10" />
  </Icon>
);

export const PlayIcon = () => (
  <Icon>
    <path d="M7 5l8 5-8 5z" />
  </Icon>
);

export const ZoomInIcon = () => (
  <Icon>
    <path d="M10 5v10M5 10h10" />
  </Icon>
);

export const ZoomOutIcon = () => (
  <Icon>
    <path d="M5 10h10" />
  </Icon>
);
