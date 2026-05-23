import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Activity,
  BarChart3,
  Cpu,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square
} from "lucide-react";

/** Minimal stroke icons (Lucide). Browse more: https://lucide.dev/icons */
export {
  Activity,
  BarChart3,
  Cpu,
  Gauge,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square
};

export type IconSize = "sm" | "md" | "lg";

const sizeMap: Record<IconSize, number> = {
  sm: 14,
  md: 16,
  lg: 18
};

const defaultStroke = 1.75;

type UiIconProps = {
  icon: LucideIcon;
  size?: IconSize;
  className?: string;
} & Omit<LucideProps, "size">;

/** Inline icon with consistent dashboard sizing. */
export function UiIcon({ icon: Icon, size = "md", className, strokeWidth = defaultStroke, ...rest }: UiIconProps) {
  return (
    <Icon
      className={className ? `ui-icon ${className}` : "ui-icon"}
      size={sizeMap[size]}
      strokeWidth={strokeWidth}
      aria-hidden
      {...rest}
    />
  );
}
