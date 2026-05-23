import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from "d3-force";
import type { SimulationParams } from "./types";

export type AgentKind = "government" | "central_bank" | "bank" | "firm" | "household";

export type AgentLayout = {
  id: number;
  kind: AgentKind;
  x: number;
  y: number;
  r: number;
  shortLabel: string;
};

export type LayoutBounds = { w: number; h: number };

type LayoutLink = SimulationLinkDatum<SimNode> & { weight: number };

type SimNode = SimulationNodeDatum & {
  id: number;
  kind: AgentKind;
  r: number;
  shortLabel: string;
};

type AgentIds = {
  govId: number;
  cbId: number;
  bankId: number;
  firmStart: number;
  hhStart: number;
  nF: number;
  nH: number;
  total: number;
};

const MAX_FORCE_LAYOUT_NODES = 2200;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function agentIds(params: SimulationParams): AgentIds {
  let id = 0;
  const govId = id++;
  const cbId = id++;
  const bankId = id++;
  const firmStart = id;
  const nF = Math.max(1, params.firms);
  id += nF;
  const hhStart = id;
  const nH = Math.max(1, params.households);
  id += nH;
  return { govId, cbId, bankId, firmStart, hhStart, nF, nH, total: id };
}

function nodeRadius(kind: AgentKind, nF: number, nH: number): number {
  switch (kind) {
    case "government":
      return 23;
    case "central_bank":
      return 22;
    case "bank":
      return 30;
    case "firm":
      return nF > 45 ? 4.2 : 6;
    case "household":
      return nH > 320 ? 2.5 : nH > 140 ? 3.2 : 4;
    default:
      return 4;
  }
}

function typeTargetX(kind: AgentKind, vb: LayoutBounds): number {
  switch (kind) {
    case "government":
      return vb.w * 0.12;
    case "central_bank":
      return vb.w * 0.5;
    case "bank":
      return vb.w * 0.46;
    case "firm":
      return vb.w * 0.86;
    case "household":
      return vb.w * 0.5;
    default:
      return vb.w * 0.5;
  }
}

function typeTargetY(kind: AgentKind, vb: LayoutBounds): number {
  switch (kind) {
    case "government":
      return vb.h * 0.5;
    case "central_bank":
      return vb.h * 0.1;
    case "bank":
      return vb.h * 0.46;
    case "firm":
      return vb.h * 0.4;
    case "household":
      return vb.h * 0.9;
    default:
      return vb.h * 0.5;
  }
}

type RawLink = { source: number; target: number; weight: number };

function addLink(map: Map<string, RawLink>, source: number, target: number, weight: number) {
  if (source === target) return;
  const a = Math.min(source, target);
  const b = Math.max(source, target);
  const key = `${a}-${b}`;
  const prev = map.get(key);
  if (!prev || weight > prev.weight) {
    map.set(key, { source: a, target: b, weight });
  }
}

/** Structural backbone matching baseline.py (layout is fixed from params only). */
function structuralLinks(ids: AgentIds): RawLink[] {
  const map = new Map<string, RawLink>();
  const { govId, cbId, bankId, firmStart, hhStart, nF, nH } = ids;

  addLink(map, govId, bankId, 3);
  addLink(map, cbId, bankId, 3);
  for (let i = 0; i < nF; i++) {
    addLink(map, bankId, firmStart + i, 2);
    addLink(map, govId, firmStart + i, 1);
  }
  for (let h = 0; h < nH; h++) {
    const firm = firmStart + (h % nF);
    addLink(map, firm, hhStart + h, 1);
  }
  return [...map.values()];
}

/** Scale and center node positions to use most of the viewBox (fixed after params). */
function fitLayoutToBounds(nodes: AgentLayout[], vb: LayoutBounds, margin = 0.05): AgentLayout[] {
  if (nodes.length === 0) return nodes;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.r);
    maxX = Math.max(maxX, n.x + n.r);
    minY = Math.min(minY, n.y - n.r);
    maxY = Math.max(maxY, n.y + n.r);
  }

  const bw = Math.max(maxX - minX, 1);
  const bh = Math.max(maxY - minY, 1);
  const padX = vb.w * margin;
  const padY = vb.h * margin;
  const scale = Math.min((vb.w - padX * 2) / bw, (vb.h - padY * 2) / bh);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const targetCx = vb.w / 2;
  const targetCy = vb.h / 2;

  return nodes.map((n) => ({
    ...n,
    x: targetCx + (n.x - cx) * scale,
    y: targetCy + (n.y - cy) * scale
  }));
}

function forceDirectedLayout(params: SimulationParams, vb: LayoutBounds): AgentLayout[] {
  const ids = agentIds(params);
  const rand = mulberry32((params.seed ?? 42) ^ ids.total ^ ids.nF ^ (ids.nH << 4));

  const nodes: SimNode[] = [];
  const pushNode = (id: number, kind: AgentKind, shortLabel: string, fx?: number, fy?: number) => {
    const r = nodeRadius(kind, ids.nF, ids.nH);
    const spread = kind === "household" ? 70 : kind === "firm" ? 80 : 0;
    nodes.push({
      id,
      kind,
      r,
      shortLabel,
      x: (fx ?? typeTargetX(kind, vb)) + (rand() - 0.5) * spread,
      y: (fy ?? typeTargetY(kind, vb)) + (rand() - 0.5) * spread,
      fx,
      fy
    });
  };

  pushNode(ids.govId, "government", "Gov", vb.w * 0.12, vb.h * 0.5);
  pushNode(ids.cbId, "central_bank", "CB", vb.w * 0.5, vb.h * 0.1);
  pushNode(ids.bankId, "bank", "Bank", vb.w * 0.46, vb.h * 0.46);

  for (let i = 0; i < ids.nF; i++) {
    pushNode(ids.firmStart + i, "firm", ids.nF <= 28 ? `F${i}` : "");
  }
  for (let h = 0; h < ids.nH; h++) {
    pushNode(ids.hhStart + h, "household", "");
  }

  const rawLinks = structuralLinks(ids);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const simLinks: LayoutLink[] = [];
  for (const l of rawLinks) {
    const s = nodeById.get(l.source);
    const t = nodeById.get(l.target);
    if (s && t) simLinks.push({ source: s, target: t, weight: l.weight });
  }

  const charge =
    ids.total > 900 ? -48 : ids.total > 400 ? -72 : ids.total > 150 ? -95 : -120;
  const linkDist = (l: LayoutLink) => {
    const s = l.source as SimNode;
    const t = l.target as SimNode;
    const base = s.r + t.r + 52;
    return s.kind === "household" || t.kind === "household" ? base + 22 : base + 38;
  };
  const linkStrength = (l: LayoutLink) => Math.min(0.75, 0.12 + 0.1 * Math.sqrt(l.weight));

  const iterations = Math.min(480, Math.max(140, 100 + Math.floor(ids.total * 0.4)));

  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(simLinks)
        .id((d) => d.id)
        .distance(linkDist)
        .strength(linkStrength)
    )
    .force("charge", forceManyBody().strength(charge).distanceMax(Math.max(vb.w, vb.h)))
    .force(
      "collide",
      forceCollide<SimNode>()
        .radius((d) => d.r + (d.kind === "household" ? 4 : 6))
        .strength(0.95)
        .iterations(3)
    )
    .force(
      "x",
      forceX<SimNode>((d) => typeTargetX(d.kind, vb))
        .strength((d) => (d.fx != null ? 0 : d.kind === "household" ? 0.04 : 0.07))
    )
    .force(
      "y",
      forceY<SimNode>((d) => typeTargetY(d.kind, vb))
        .strength((d) => (d.fx != null ? 0 : d.kind === "household" ? 0.05 : 0.08))
    )
    .force("center", forceCenter(vb.w / 2, vb.h / 2).strength(0.02))
    .stop();

  for (let i = 0; i < iterations; i++) simulation.tick();

  const laidOut: AgentLayout[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    x: n.x ?? vb.w / 2,
    y: n.y ?? vb.h / 2,
    r: n.r,
    shortLabel: n.shortLabel
  }));

  return fitLayoutToBounds(laidOut, vb, 0.055);
}

function geometricFallbackLayout(params: SimulationParams, vb: LayoutBounds): AgentLayout[] {
  let id = 0;
  const govId = id++;
  const cbId = id++;
  const bankId = id++;
  const firmStart = id;
  const nF = Math.max(1, params.firms);
  id += nF;
  const hhStart = id;
  const nH = Math.max(1, params.households);

  const cx = vb.w * 0.5;
  const cy = vb.h * 0.46;
  const nodes: AgentLayout[] = [];

  nodes.push({ id: govId, kind: "government", x: vb.w * 0.1, y: cy, r: 23, shortLabel: "Gov" });
  nodes.push({ id: cbId, kind: "central_bank", x: cx, y: vb.h * 0.1, r: 22, shortLabel: "CB" });
  nodes.push({ id: bankId, kind: "bank", x: cx, y: cy, r: 30, shortLabel: "Bank" });

  const firmR = Math.min(vb.w * 0.32, 180 + nF * 4);
  const firmCx = vb.w * 0.82;
  for (let i = 0; i < nF; i++) {
    const t = (i + 0.5) / nF;
    const theta = -0.6 * Math.PI + 1.2 * Math.PI * t;
    nodes.push({
      id: firmStart + i,
      kind: "firm",
      x: firmCx + firmR * Math.cos(theta),
      y: cy + firmR * Math.sin(theta),
      r: 4.2,
      shortLabel: nF <= 28 ? `F${i}` : ""
    });
  }

  const hhTheta0 = Math.PI / 8;
  const hhTheta1 = (7 * Math.PI) / 8;
  const hhSpan = hhTheta1 - hhTheta0;
  const hhR = Math.min(vb.w * 0.44, Math.max(vb.h * 0.38, (nH * 6.5) / hhSpan));
  for (let h = 0; h < nH; h++) {
    const t = (h + 0.5) / nH;
    const theta = hhTheta0 + hhSpan * t;
    nodes.push({
      id: hhStart + h,
      kind: "household",
      x: cx + hhR * Math.cos(theta),
      y: cy + hhR * Math.sin(theta),
      r: 2.5,
      shortLabel: ""
    });
  }

  return fitLayoutToBounds(nodes, vb, 0.055);
}

/** Compute agent positions once from simulation parameters (not live telemetry). */
export function computeAgentLayout(params: SimulationParams, vb: LayoutBounds): AgentLayout[] {
  const ids = agentIds(params);
  if (ids.total > MAX_FORCE_LAYOUT_NODES) {
    return geometricFallbackLayout(params, vb);
  }
  return forceDirectedLayout(params, vb);
}
