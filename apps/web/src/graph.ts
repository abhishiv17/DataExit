// Data map: the user at the centre, one node per company.
//   angle    = sector (each sector gets a wedge)
//   distance = time since last use (rings at 1 and 3 years)
//   colour   = sensitivity band, size = number of data categories held

import * as d3 from "d3";
import { sensitivityBand, type FootprintView } from "@dataexit/shared/ui";

const YEAR = 365 * 864e5;

export const SECTOR_LABEL: Record<string, string> = {
  ecommerce: "Shopping", food_delivery: "Food & grocery", social: "Social & dating", bank: "Banks",
  fintech: "Fintech & loans", broker: "Investing", insurance: "Insurance", telecom: "Telecom",
  health: "Health", travel: "Travel & rides", edtech: "Education", gaming: "Gaming",
  utility: "Media & apps", government: "Government", other: "Jobs, property & more",
};

interface Node extends d3.SimulationNodeDatum {
  fp: FootprintView;
  r: number;
  tx: number;
  ty: number;
}

export interface GraphHandle {
  setMatch(fn: (fp: FootprintView) => boolean): void;
  refresh(): void;
  focus(id: string | null): void;
}

export function createGraph(
  host: HTMLElement,
  footprints: FootprintView[],
  scannedAt: Date,
  opts: { onClick: (fp: FootprintView, additive: boolean) => void; isSelected: (id: string) => boolean },
): GraphHandle {
  host.innerHTML = "";
  const width = host.clientWidth || 900;
  const height = host.clientHeight || 700;
  const cx = width / 2, cy = height / 2;
  const maxR = Math.min(width, height) / 2 - 36;
  const ageYears = (fp: FootprintView) => (scannedAt.getTime() - new Date(fp.lastSeen).getTime()) / YEAR;
  const dist = d3.scaleLinear().domain([0, 1, 3, 8]).range([maxR * 0.16, maxR * 0.58, maxR * 0.8, maxR]).clamp(true);

  // Sector wedges sized by count.
  const counts = d3.rollup(footprints, (v) => v.length, (f) => f.company.sector);
  const sectors = [...counts.keys()].sort((a, b) => (SECTOR_LABEL[a] ?? a).localeCompare(SECTOR_LABEL[b] ?? b));
  const wedge = new Map<string, [number, number]>();
  let acc = -Math.PI / 2;
  for (const s of sectors) {
    const span = (counts.get(s)! / footprints.length) * Math.PI * 2;
    wedge.set(s, [acc, acc + span]);
    acc += span;
  }

  // Deterministic jitter within the wedge so layout is stable between reloads.
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) / 2 ** 32;
  const nodes: Node[] = footprints.map((fp) => {
    const [a0, a1] = wedge.get(fp.company.sector)!;
    const angle = a0 + (a1 - a0) * (0.15 + 0.7 * hash(fp.company.id));
    const d = dist(ageYears(fp));
    const tx = cx + d * Math.cos(angle), ty = cy + d * Math.sin(angle);
    return { fp, r: 3 + fp.company.dataCategories.length * 1.1, tx, ty, x: tx, y: ty };
  });

  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX<Node>((n) => n.tx).strength(0.35))
    .force("y", d3.forceY<Node>((n) => n.ty).strength(0.35))
    .force("collide", d3.forceCollide<Node>((n) => n.r + 1.5))
    .stop();
  for (let i = 0; i < 260; i++) sim.tick();

  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("class", "graph");
  const root = svg.append("g");
  svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.6, 5]).on("zoom", (e) => root.attr("transform", e.transform)));

  // Rings
  const rings = root.append("g").attr("class", "rings");
  for (const [yrs, label] of [[1, "1 year unused"], [3, "3 years unused"]] as const) {
    rings.append("circle").attr("cx", cx).attr("cy", cy).attr("r", dist(yrs));
    rings.append("text").attr("x", cx).attr("y", cy - dist(yrs) - 4).attr("text-anchor", "middle").text(label);
  }
  // Sector spokes + labels
  const labels = root.append("g").attr("class", "sector-labels");
  for (const s of sectors) {
    const [a0, a1] = wedge.get(s)!;
    labels.append("line").attr("x1", cx).attr("y1", cy)
      .attr("x2", cx + (maxR + 10) * Math.cos(a0)).attr("y2", cy + (maxR + 10) * Math.sin(a0));
    const mid = (a0 + a1) / 2;
    const lr = maxR + 18;
    labels.append("text")
      .attr("x", cx + lr * Math.cos(mid)).attr("y", cy + lr * Math.sin(mid))
      .attr("text-anchor", Math.cos(mid) > 0.2 ? "start" : Math.cos(mid) < -0.2 ? "end" : "middle")
      .attr("dominant-baseline", "middle")
      .text(`${SECTOR_LABEL[s] ?? s} · ${counts.get(s)}`);
  }

  const links = root.append("g").attr("class", "links").selectAll("line").data(nodes).join("line")
    .attr("x1", cx).attr("y1", cy).attr("x2", (n) => n.x!).attr("y2", (n) => n.y!);

  const tip = d3.select(host).append("div").attr("class", "tip").style("opacity", 0);

  const dots = root.append("g").attr("class", "nodes").selectAll<SVGCircleElement, Node>("circle").data(nodes).join("circle")
    .attr("cx", (n) => n.x!).attr("cy", (n) => n.y!).attr("r", 0)
    .attr("class", (n) => `node band-${sensitivityBand(n.fp.sensitivity)}`)
    .attr("tabindex", 0)
    .attr("role", "button")
    .attr("aria-label", (n) => `${n.fp.company.name}, ${sensitivityBand(n.fp.sensitivity)} sensitivity`)
    .on("click", (e: MouseEvent, n) => opts.onClick(n.fp, e.shiftKey || e.metaKey || e.ctrlKey))
    .on("keydown", (e: KeyboardEvent, n) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opts.onClick(n.fp, e.shiftKey); } })
    .on("mouseenter", (e: MouseEvent, n) => {
      const yrs = ageYears(n.fp);
      tip.style("opacity", 1).html(`<strong>${n.fp.company.name}</strong><br>${yrs < 1 ? "used recently" : `unused ${yrs.toFixed(1)} yrs`}`);
    })
    .on("mousemove", (e: MouseEvent) => {
      const b = host.getBoundingClientRect();
      tip.style("left", `${e.clientX - b.left + 12}px`).style("top", `${e.clientY - b.top + 12}px`);
    })
    .on("mouseleave", () => tip.style("opacity", 0));

  dots.transition().duration(700).delay((_, i) => i * 3).attr("r", (n) => n.r);

  root.append("circle").attr("class", "me").attr("cx", cx).attr("cy", cy).attr("r", 18);
  root.append("text").attr("class", "me-label").attr("x", cx).attr("y", cy).attr("dominant-baseline", "central").attr("text-anchor", "middle").text("You");

  let match: (fp: FootprintView) => boolean = () => true;
  let focused: string | null = null;

  function refresh() {
    dots.classed("dim", (n) => !match(n.fp))
      .classed("selected", (n) => opts.isSelected(n.fp.company.id))
      .classed("focused", (n) => n.fp.company.id === focused);
    links.classed("dim", (n) => !match(n.fp)).classed("selected", (n) => opts.isSelected(n.fp.company.id));
  }

  return {
    setMatch(fn) { match = fn; refresh(); },
    refresh,
    focus(id) { focused = id; refresh(); },
  };
}
