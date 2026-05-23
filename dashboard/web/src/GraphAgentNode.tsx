import type { AgentLayout } from "./graphLayout";
import {
  agentEdgeRadius,
  agentShowsLabel,
  labelOffsetBelowHalo,
  nodeHaloRadius,
  nodeIconSize
} from "./nodeMetrics";
import { AGENT_NODE_META } from "./ui/icons";

type Props = {
  agent: AgentLayout;
  breath: number;
  zoom: number;
  firmCount: number;
  glowFilterId?: string;
};

function strokeWidth(agent: AgentLayout): number {
  if (agent.kind === "bank" || agent.kind === "government") return 2;
  if (agent.kind === "household") return 1.65;
  return 1.85;
}

export function GraphAgentNode({ agent, breath, zoom, firmCount, glowFilterId }: Props) {
  const meta = AGENT_NODE_META[agent.kind];
  const Icon = meta.icon;
  const iconPx = nodeIconSize(agent);
  const halo = nodeHaloRadius(agent);
  const half = iconPx / 2;
  const opacity = 0.5 + breath * (agent.kind === "household" ? 0.38 : 0.48);
  const showLabel = agentShowsLabel(agent, firmCount);
  const useGlow = (agent.kind === "bank" || agent.kind === "central_bank") && glowFilterId;
  const labelY = halo + labelOffsetBelowHalo(agent, firmCount);

  return (
    <g className={`live-graph-node live-graph-node--${agent.kind}`} transform={`translate(${agent.x}, ${agent.y})`}>
      <title>{`${meta.label} · id ${agent.id}`}</title>

      <circle
        className="live-graph-node-halo"
        r={halo}
        fill={meta.fill}
        stroke={meta.color}
        strokeOpacity={0.55}
        strokeWidth={agent.kind === "bank" ? 2 : 1.25}
        vectorEffect="non-scaling-stroke"
        style={{
          opacity,
          filter: useGlow ? `url(#${glowFilterId})` : undefined
        }}
      />

      <Icon
        x={-half}
        y={-half}
        width={iconPx}
        height={iconPx}
        color={meta.color}
        strokeWidth={strokeWidth(agent)}
        vectorEffect="non-scaling-stroke"
        style={{ opacity: 0.88 + breath * 0.1 }}
      />

      {showLabel ? (
        <text
          y={labelY}
          textAnchor="middle"
          className="live-graph-node-label"
          fontSize={Math.max(8, 10 / zoom)}
          fill={meta.color}
        >
          {agent.shortLabel}
        </text>
      ) : null}
    </g>
  );
}

export { agentEdgeRadius };
