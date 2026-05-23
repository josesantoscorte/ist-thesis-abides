import type { LucideIcon, LucideProps } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  CircleDollarSign,
  Cpu,
  Factory,
  Gauge,
  Home,
  Landmark,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square
} from "lucide-react";
import type { AgentKind } from "../graphLayout";

/** Minimal stroke icons (Lucide). Browse more: https://lucide.dev/icons */
export {
  Activity,
  BarChart3,
  Building2,
  CircleDollarSign,
  Cpu,
  Factory,
  Gauge,
  Home,
  Landmark,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Square
};

export type AgentNodeMeta = {
  icon: LucideIcon;
  label: string;
  color: string;
  fill: string;
};

/** Graph node appearance by agent kind. */
export const AGENT_NODE_META: Record<AgentKind, AgentNodeMeta> = {
  government: {
    icon: Landmark,
    label: "Government",
    color: "#fbbf24",
    fill: "rgba(180, 83, 9, 0.28)"
  },
  central_bank: {
    icon: CircleDollarSign,
    label: "Central bank",
    color: "#c4b5fd",
    fill: "rgba(139, 92, 246, 0.24)"
  },
  bank: {
    icon: Building2,
    label: "Bank",
    color: "#f4f4f5",
    fill: "rgba(228, 228, 231, 0.14)"
  },
  firm: {
    icon: Factory,
    label: "Firm",
    color: "#7dd3fc",
    fill: "rgba(14, 165, 233, 0.2)"
  },
  household: {
    icon: Home,
    label: "Household",
    color: "#d4d4d8",
    fill: "rgba(82, 82, 91, 0.55)"
  }
};

export const AGENT_KIND_LEGEND: AgentKind[] = ["government", "central_bank", "bank", "firm", "household"];

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
