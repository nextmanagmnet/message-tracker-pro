import { cn } from "@/lib/utils";
import { useTheme } from "./theme";

type Variant = "horizontal" | "stacked" | "mark";

interface LogoProps {
  variant?: Variant;
  /** Force the white-text version (e.g. on a mesh gradient), regardless of theme. */
  onDark?: boolean;
  /** Set the height (e.g. "h-10"); width follows the logo's own aspect ratio. */
  className?: string;
}

const SOURCES: Record<Variant, { light: string; dark: string }> = {
  horizontal: { light: "/brand/wob-logo-horizontal-light.png", dark: "/brand/wob-logo-horizontal-dark.png" },
  stacked: { light: "/brand/wob-logo-stacked-light.png", dark: "/brand/wob-logo-stacked-dark.png" },
  mark: { light: "/brand/wob-mark.png", dark: "/brand/wob-mark.png" },
};

// Brand rules: never recolor, stretch, rotate or add effects; keep clear
// space equal to the "W" height around it (callers add margin, ~1/3 of height).
export function Logo({ variant = "horizontal", onDark, className }: LogoProps) {
  const theme = useTheme();
  const src = SOURCES[variant][onDark || theme === "dark" ? "dark" : "light"];
  return (
    <img
      src={src}
      alt="WOB — World of Business"
      className={cn("h-10 w-auto shrink-0 object-contain select-none", className)}
      draggable={false}
    />
  );
}
