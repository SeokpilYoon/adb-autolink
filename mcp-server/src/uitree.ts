/**
 * Android UI tree from `uiautomator dump`: the on-screen elements with text, description, resource id
 * and bounds, flattened so the model can tap an element's center instead of guessing from a screenshot.
 * No extra app on the phone: uiautomator ships with Android.
 */

export interface UiNode {
  text: string;
  desc: string;
  id: string;
  cls: string;
  pkg: string;
  clickable: boolean;
  longClickable: boolean;
  scrollable: boolean;
  checkable: boolean;
  checked: boolean;
  enabled: boolean;
  focused: boolean;
  selected: boolean;
  password: boolean;
  bounds: [number, number, number, number];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1]?.toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Every <node> of a uiautomator dump, in document order. */
export function parseUiDump(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]!] = decode(a[2]!);
    const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(attrs.bounds ?? "");
    if (!b) continue;
    const flag = (k: string) => attrs[k] === "true";
    nodes.push({
      text: attrs.text ?? "",
      desc: attrs["content-desc"] ?? "",
      id: attrs["resource-id"] ?? "",
      cls: attrs.class ?? "",
      pkg: attrs.package ?? "",
      clickable: flag("clickable"),
      longClickable: flag("long-clickable"),
      scrollable: flag("scrollable"),
      checkable: flag("checkable"),
      checked: flag("checked"),
      enabled: attrs.enabled !== "false",
      focused: flag("focused"),
      selected: flag("selected"),
      password: flag("password"),
      bounds: [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])],
    });
  }
  return nodes;
}

export const center = (n: UiNode): [number, number] => [
  Math.round((n.bounds[0] + n.bounds[2]) / 2),
  Math.round((n.bounds[1] + n.bounds[3]) / 2),
];

const hasArea = (n: UiNode) => n.bounds[2] > n.bounds[0] && n.bounds[3] > n.bounds[1];
const interactive = (n: UiNode) => n.clickable || n.longClickable || n.scrollable || n.checkable;
/** Layout containers with nothing to read or press are noise. */
const meaningful = (n: UiNode) => hasArea(n) && (n.text !== "" || n.desc !== "" || interactive(n) || n.focused);

export interface UiFilter {
  /** Case-insensitive substring of text, description or resource id. */
  search?: string;
  /** Only elements that react to touch (clickable, long-clickable, scrollable, checkable). */
  interactiveOnly?: boolean;
  limit?: number;
}

export function filterUi(nodes: UiNode[], f: UiFilter = {}): { shown: UiNode[]; total: number } {
  const q = f.search?.trim().toLowerCase();
  const matched = nodes.filter(
    (n) =>
      meaningful(n) &&
      (!f.interactiveOnly || interactive(n)) &&
      (!q || n.text.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)),
  );
  return { shown: matched.slice(0, f.limit ?? 150), total: matched.length };
}

/** One line per element; `tap x y` uses the printed center directly. */
export function formatUiNode(n: UiNode, i: number): string {
  const parts = [`[${i}]`];
  const cls = n.cls.split(".").pop() || "View";
  parts.push(cls);
  if (n.text) parts.push(`text=${JSON.stringify(n.password ? "•••" : n.text)}`);
  if (n.desc) parts.push(`desc=${JSON.stringify(n.desc)}`);
  if (n.id) parts.push(`id=${n.id.replace(/^[\w.]+:id\//, "")}`);
  const flags = [
    n.clickable && "clickable",
    n.longClickable && "long-clickable",
    n.scrollable && "scrollable",
    n.checkable && (n.checked ? "checked" : "unchecked"),
    n.selected && "selected",
    n.focused && "focused",
    !n.enabled && "disabled",
  ].filter(Boolean);
  if (flags.length) parts.push(flags.join(","));
  const [x, y] = center(n);
  parts.push(`center=(${x},${y})`, `bounds=[${n.bounds.join(",")}]`);
  return parts.join(" ");
}

/** A game engine draws its own UI into one surface, so the tree cannot see its buttons. */
export function looksLikeGameSurface(nodes: UiNode[]): boolean {
  const meaningfulCount = nodes.filter(meaningful).length;
  const surface = nodes.some((n) => /SurfaceView|TextureView|UnityPlayer|GLSurfaceView/i.test(n.cls));
  return surface && meaningfulCount <= 3;
}

/** uiautomator gives up when the screen never settles, typical of games that redraw every frame. */
export function dumpFailure(output: string): "idle" | "other" | undefined {
  if (/<hierarchy/i.test(output)) return undefined;
  return /idle state/i.test(output) ? "idle" : "other";
}
