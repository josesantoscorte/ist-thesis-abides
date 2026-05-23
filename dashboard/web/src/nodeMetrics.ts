import type { AgentLayout, AgentKind } from "./graphLayout";

const MAX_FIRM_LABELS = 10;

/** Whether this agent shows a text label under the icon. */
export function agentShowsLabel(agent: Pick<AgentLayout, "kind" | "shortLabel">, nF: number): boolean {
  if (!agent.shortLabel) return false;
  if (agent.kind === "government" || agent.kind === "central_bank" || agent.kind === "bank") return true;
  if (agent.kind === "firm") return nF <= MAX_FIRM_LABELS;
  return false;
}

export function firmLabelForIndex(index: number, nF: number): string {
  return nF <= MAX_FIRM_LABELS ? `F${index}` : "";
}

export function nodeIconSize(agent: Pick<AgentLayout, "kind" | "r" | "shortLabel">): number {
  switch (agent.kind) {
    case "government":
      return 24;
    case "central_bank":
      return 22;
    case "bank":
      return 28;
    case "firm":
      return agent.shortLabel ? 14 : 11;
    case "household":
      return agent.r <= 5 ? 8 : 10;
    default:
      return 10;
  }
}

export function nodeHaloRadius(agent: Pick<AgentLayout, "kind" | "r" | "shortLabel">): number {
  const iconPx = nodeIconSize(agent);
  return Math.max(agent.r, iconPx * 0.55 + 5);
}

/** Vertical gap from node center to bottom of label (SVG coords). */
export function labelOffsetBelowHalo(agent: Pick<AgentLayout, "kind" | "shortLabel">, nF: number): number {
  if (!agentShowsLabel(agent, nF)) return 0;
  if (agent.kind === "bank") return 18;
  return 14;
}

/**
 * Collision radius for layout: circle that contains icon halo + label box.
 */
export function nodeCollisionRadius(
  agent: Pick<AgentLayout, "kind" | "r" | "shortLabel" | "id">,
  nF: number
): number {
  const halo = nodeHaloRadius(agent);
  if (!agentShowsLabel(agent, nF)) {
    return halo + (agent.kind === "household" ? 6 : 8);
  }

  const labelLen = agent.shortLabel?.length ?? 0;
  const halfW = Math.max(12, labelLen * 3.6);
  const below = labelOffsetBelowHalo(agent, nF) + 8;
  const pad = agent.kind === "bank" ? 8 : 5;
  return Math.sqrt(halo * halo + below * below + halfW * halfW * 0.25) + pad;
}

export function agentEdgeRadius(agent: AgentLayout, nF: number): number {
  const halo = nodeHaloRadius(agent);
  const labelPad = agentShowsLabel(agent, nF) ? labelOffsetBelowHalo(agent, nF) * 0.35 : 0;
  return halo + labelPad;
}

export function isPinnedAgent(id: number): boolean {
  return id <= 2;
}
