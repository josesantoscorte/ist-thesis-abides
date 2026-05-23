import { useEffect, useId, useMemo, useRef, useState } from "react";
import { computeAgentLayout, type AgentKind } from "./graphLayout";
import type { RunState, SimulationParams, TelemetryEvent } from "./types";
import { Maximize2, Minimize2, Network, RotateCcw, UiIcon } from "./ui/icons";

type Props = {
  run: RunState | null;
  params: SimulationParams;
  telemetry: TelemetryEvent[];
};

/** Scene size (SVG user space). */
const LIVE_GRAPH_VB = { w: 1320, h: 780 };

const FAMILY_COLORS: Record<string, string> = {
  labor: "#009E73",
  credit: "#0072B2",
  fiscal: "#D55E00",
  monetary: "#E69F00",
  policy: "#CC79A7",
  trade: "#56B4E9",
  unknown: "#a1a1aa"
};

const NODE_STROKE: Record<AgentKind, string> = {
  government: "rgba(245, 158, 11, 0.85)",
  central_bank: "rgba(167, 139, 250, 0.9)",
  bank: "rgba(244, 244, 245, 0.95)",
  firm: "rgba(56, 189, 248, 0.75)",
  household: "rgba(113, 113, 122, 0.65)"
};

const LEGEND_FAMILIES: Array<{ key: string; label: string }> = [
  { key: "labor", label: "Labor" },
  { key: "credit", label: "Credit" },
  { key: "fiscal", label: "Fiscal" },
  { key: "monetary", label: "Monetary" },
  { key: "policy", label: "Policy" },
  { key: "trade", label: "Trade" },
  { key: "unknown", label: "Other" }
];

const MAX_VISIBLE_EDGES = 130;

const ZOOM_MIN = 0.35;
const ZOOM_MAX = 4;

/** Map screen coordinates to SVG viewBox space (handles letterboxing from preserveAspectRatio). */
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } | null {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const mapped = pt.matrixTransform(ctm.inverse());
  return { x: mapped.x, y: mapped.y };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function pairBend(sender: number, recipient: number): number {
  const h = (sender * 48271 + recipient * 65521) % 2001;
  return (h / 2001 - 0.5) * 0.38;
}

function quadPath(x1: number, y1: number, x2: number, y2: number, bend: number): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * len * bend;
  const cy = my + ny * len * bend;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function ptOnCircle(ax: number, ay: number, ar: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  return { x: ax + (dx / L) * ar, y: ay + (dy / L) * ar };
}

type PairAgg = {
  sender: number;
  recipient: number;
  total: number;
  dominantFamily: string;
};

function aggregateEdges(events: TelemetryEvent[], agentCount: number): PairAgg[] {
  const map = new Map<string, { families: Record<string, number>; sender: number; recipient: number }>();
  const maxId = agentCount - 1;

  for (const ev of events) {
    const s = typeof ev.sender === "number" ? ev.sender : Number(ev.sender);
    const r = typeof ev.recipient === "number" ? ev.recipient : Number(ev.recipient);
    if (!Number.isFinite(s) || !Number.isFinite(r) || s === r) continue;
    if (s < 0 || r < 0 || s > maxId || r > maxId) continue;
    const fam = typeof ev.family === "string" && ev.family ? ev.family : "unknown";
    const key = `${s}\t${r}`;
    let row = map.get(key);
    if (!row) {
      row = { families: {}, sender: s, recipient: r };
      map.set(key, row);
    }
    row.families[fam] = (row.families[fam] || 0) + 1;
  }

  const rows: PairAgg[] = [];
  for (const row of map.values()) {
    let best = "unknown";
    let bestC = 0;
    let total = 0;
    for (const [f, c] of Object.entries(row.families)) {
      total += c;
      if (c > bestC) {
        bestC = c;
        best = f;
      }
    }
    rows.push({ sender: row.sender, recipient: row.recipient, total, dominantFamily: best });
  }

  rows.sort((a, b) => b.total - a.total);
  return rows.slice(0, MAX_VISIBLE_EDGES);
}

export function LiveAgentGraph({ run, params, telemetry }: Props) {
  const uid = useId().replace(/:/g, "");
  const gradNode = `live-node-${uid}`;
  const filterGlow = `live-glow-${uid}`;

  const vb = LIVE_GRAPH_VB;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    panStart: { x: number; y: number };
    pointerStart: { x: number; y: number };
  }>({
    active: false,
    panStart: { x: 0, y: 0 },
    pointerStart: { x: 0, y: 0 }
  });
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const fullscreenRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [tick, setTick] = useState(0);
  const prevRef = useRef<{ msg: number; t: number } | null>(null);
  const [activity, setActivity] = useState(0);

  const agents = useMemo(
    () => computeAgentLayout(params, LIVE_GRAPH_VB),
    [params.firms, params.households, params.seed]
  );
  const agentCount = agents.length;
  const posById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [params.firms, params.households, params.seed]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    const host = fullscreenRef.current;
    if (!host) return;
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen();
      } else {
        await host.requestFullscreen();
      }
    } catch {
      /* browser may block without user gesture */
    }
  };

  useEffect(() => {
    const host = viewportRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const m = clientToSvg(svg, e.clientX, e.clientY);
      if (!m) return;

      const factor = e.deltaY > 0 ? 0.9 : 1.11;
      const cx = vb.w / 2;
      const cy = vb.h / 2;
      setZoom((z) => {
        const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * factor));
        if (next === z) return z;
        setPan((p) => ({
          x: m.x - cx - (next / z) * (m.x - p.x - cx),
          y: m.y - cy - (next / z) * (m.y - p.y - cy)
        }));
        return next;
      });
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, []);

  const cx = vb.w / 2;
  const cy = vb.h / 2;
  const contentTransform = `translate(${pan.x + cx} ${pan.y + cy}) scale(${zoom}) translate(${-cx} ${-cy})`;

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const m = clientToSvg(svg, e.clientX, e.clientY);
    if (!m) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { active: true, panStart: { ...pan }, pointerStart: m };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const svg = svgRef.current;
    if (!svg) return;
    const m = clientToSvg(svg, e.clientX, e.clientY);
    if (!m) return;
    const { panStart, pointerStart } = dragRef.current;
    setPan({
      x: panStart.x + (m.x - pointerStart.x),
      y: panStart.y + (m.y - pointerStart.y)
    });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current.active = false;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const resetView = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!run) {
      setActivity(0);
      prevRef.current = null;
      return;
    }
    const now = performance.now();
    const msg = run.live.messages_processed;
    const prev = prevRef.current;
    if (!prev) {
      prevRef.current = { msg, t: now };
      return;
    }
    const dt = (now - prev.t) / 1000;
    if (dt <= 0) return;
    const rate = (msg - prev.msg) / dt;
    const normalized = clamp01(Math.log10(1 + rate) / 6);
    setActivity(normalized);
    prevRef.current = { msg, t: now };
  }, [run, tick]);

  const isIdle = !run || (run.status !== "running" && run.status !== "stopping");
  const isLive = Boolean(run && (run.status === "running" || run.status === "stopping"));

  const edges = useMemo(() => aggregateEdges(telemetry, agentCount), [telemetry, agentCount]);
  const maxEdgeWeight = edges.length ? edges[0].total : 1;

  const breath = isIdle ? 0.28 : 0.38 + activity * 0.45;

  const caption = (() => {
    if (isIdle) {
      return `${agentCount} agents · layout fixed from parameters (structural graph). Scroll/pinch to zoom, drag to pan; fullscreen expands the graph panel. Live edges tint by message family.`;
    }
    if (edges.length > 0) {
      return `Showing up to ${MAX_VISIBLE_EDGES} busiest directed links from recent telemetry (sampled 1 in N). Stroke color = dominant message family on that link. Zoom into regions to untangle overlaps.`;
    }
    return "Waiting for first flushed telemetry lines… If this persists, ensure the dashboard started the run (sets ABIDES_TELEMETRY_N) and check log/<run>/telemetry.jsonl.";
  })();

  return (
    <div className="live-graph-wrap">
      <div className="live-graph-inner">
        <div className="live-graph-header">
          <div className="live-graph-title-row">
            <h4>
              <UiIcon icon={Network} className="live-graph-title-icon" />
              Agent network
            </h4>
            {isLive ? (
              <span className={`live-graph-live ${edges.length ? "live-graph-live--on" : ""}`}>
                {edges.length ? `${telemetry.length} samples` : "Sampling"}
              </span>
            ) : null}
          </div>
          <span className="live-graph-meta">
            {params.firms} firms · {params.households} households · {agentCount} agents · scroll zoom · drag pan
          </span>
        </div>

        <div className="live-graph-fs-host" ref={fullscreenRef}>
          <div className="live-graph-viewport" ref={viewportRef}>
            <div className="live-graph-viewport-toolbar">
              <button
                type="button"
                className="live-graph-icon-btn"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                <UiIcon icon={isFullscreen ? Minimize2 : Maximize2} size="lg" className="live-graph-toolbar-icon" />
              </button>
              <div className="live-graph-viewport-toolbar-right">
                <button
                  type="button"
                  className="secondary live-graph-reset-btn"
                  onClick={resetView}
                  title="Reset view"
                >
                  <UiIcon icon={RotateCcw} size="sm" className="live-graph-toolbar-icon" />
                  Reset view
                </button>
                <span className="live-graph-zoom-hint" aria-hidden>
                  {zoom >= 10 ? zoom.toFixed(1) : `${zoom.toFixed(2)}×`}
                </span>
              </div>
            </div>
          <svg
            ref={svgRef}
            className="live-graph-svg live-graph-svg--network"
            viewBox={`0 0 ${vb.w} ${vb.h}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`Agent graph with ${agentCount} nodes`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{
              cursor: dragging ? "grabbing" : "grab",
              touchAction: "none",
              userSelect: "none",
              WebkitUserSelect: "none"
            }}
          >
            <defs>
              <radialGradient id={gradNode} cx="38%" cy="35%" r="70%">
                <stop offset="0%" stopColor="rgba(250,250,250,0.16)" />
                <stop offset="100%" stopColor="rgba(30,30,36,0.5)" />
              </radialGradient>
              <filter id={filterGlow} x="-55%" y="-55%" width="210%" height="210%">
                <feGaussianBlur stdDeviation="2.4" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <g transform={contentTransform}>
              <g className="live-graph-edges">
                {edges.map((e) => {
                  const a = posById.get(e.sender);
                  const b = posById.get(e.recipient);
                  if (!a || !b) return null;
                  const p1 = ptOnCircle(a.x, a.y, a.r, b.x, b.y);
                  const p2 = ptOnCircle(b.x, b.y, b.r, a.x, a.y);
                  const d = quadPath(p1.x, p1.y, p2.x, p2.y, pairBend(e.sender, e.recipient));
                  const w = clamp01(e.total / maxEdgeWeight);
                  const stroke = FAMILY_COLORS[e.dominantFamily] ?? FAMILY_COLORS.unknown;
                  return (
                    <path
                      key={`${e.sender}-${e.recipient}`}
                      d={d}
                      className="live-graph-edge live-graph-edge--data"
                      fill="none"
                      stroke={stroke}
                      strokeOpacity={0.38 + w * 0.58}
                      strokeWidth={0.85 + w * 4.2}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      strokeDasharray="14 18"
                      style={{ animationDuration: `${Math.max(1.1, 3.4 - w * 2.2)}s` }}
                    />
                  );
                })}
              </g>

              {agents.map((a) => (
                <g key={a.id} className={`live-graph-node live-graph-node--${a.kind}`} transform={`translate(${a.x}, ${a.y})`}>
                  <title>{`${a.kind.replace(/_/g, " ")} · id ${a.id}`}</title>
                  <circle
                    r={a.r}
                    fill={`url(#${gradNode})`}
                    fillOpacity={0.92}
                    stroke={NODE_STROKE[a.kind]}
                    strokeWidth={a.kind === "bank" ? 2 : a.kind === "household" ? 0.9 : 1.35}
                    vectorEffect="non-scaling-stroke"
                    style={{
                      filter: a.kind === "bank" || a.kind === "central_bank" ? `url(#${filterGlow})` : undefined,
                      opacity: 0.42 + breath * (a.kind === "household" ? 0.38 : 0.52)
                    }}
                  />
                  {a.shortLabel ? (
                    <text
                      y={a.kind === "firm" ? 3.5 : 4}
                      textAnchor="middle"
                      className="live-graph-node-label"
                      fontSize={10 / zoom}
                    >
                      {a.shortLabel}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          </svg>
          </div>
        </div>

        <div className="live-graph-legend">
          <span className="live-graph-legend-title">Message family</span>
          <ul className="live-graph-legend-items" aria-label="Message family color key">
            {LEGEND_FAMILIES.map(({ key, label }) => (
              <li key={key}>
                <span className="live-graph-legend-swatch" style={{ background: FAMILY_COLORS[key] ?? FAMILY_COLORS.unknown }} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <p className="live-graph-caption">{caption}</p>
      </div>
    </div>
  );
}
