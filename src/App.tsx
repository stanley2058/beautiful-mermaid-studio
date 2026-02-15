import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  clearDiagramTokenFromUrl,
  decodeDiagramToken,
  encodeDiagramToken,
  readDiagramTokenFromUrl,
  writeDiagramTokenToUrl,
} from "@/lib/share-link";
import { cn } from "@/lib/utils";
import { THEMES, renderMermaid, renderMermaidAscii, type ThemeName } from "beautiful-mermaid";
import {
  Check,
  ClipboardCopy,
  Code2,
  Copy,
  Download,
  Eye,
  FileImage,
  Link2,
  Minus,
  MoonStar,
  Palette,
  Plus,
  ScanSearch,
  SunMedium,
  Terminal,
} from "lucide-react";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import langMermaid from "shiki/langs/mermaid.mjs";
import themeCatppuccinLatte from "shiki/themes/catppuccin-latte.mjs";
import themeCatppuccinMocha from "shiki/themes/catppuccin-mocha.mjs";
import themeDracula from "shiki/themes/dracula.mjs";
import themeGithubDark from "shiki/themes/github-dark.mjs";
import themeGithubLight from "shiki/themes/github-light.mjs";
import themeNord from "shiki/themes/nord.mjs";
import themeOneDarkPro from "shiki/themes/one-dark-pro.mjs";
import themeSolarizedDark from "shiki/themes/solarized-dark.mjs";
import themeSolarizedLight from "shiki/themes/solarized-light.mjs";
import themeTokyoNight from "shiki/themes/tokyo-night.mjs";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./index.css";

/* ─── Types ─── */

type ThemeMode = "light" | "dark";
type RenderStyle = "svg" | "unicode" | "ascii";
type SvgSize = { width: number; height: number };
type Transform = { x: number; y: number; scale: number };
type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

/* ─── Constants ─── */

const MERMAID_THEME_BY_MODE = { light: "github-light", dark: "github-dark" } as const;
const PNG_SCALES = [1, 2, 8, 16] as const;
const MIN_SCALE = 0.2;
const MAX_SCALE = 16;

const DIAGRAM_PRESETS = {
  Flowchart: `graph TD
  Start([Receive Request]) --> Parse{Valid Input?}
  Parse -->|Yes| Build[Build Context]
  Parse -->|No| Reject[Return Validation Error]
  Build --> Decide{Need External API?}
  Decide -->|Yes| Fetch[(Data Source)]
  Decide -->|No| Compute[Compute Locally]
  Fetch --> Merge[Merge Data]
  Compute --> Merge
  Merge --> Response([Send Response])`,
  Sequence: `sequenceDiagram
  autonumber
  participant Browser
  participant App as Mermaid Studio
  participant Engine as beautiful-mermaid

  Browser->>App: Edit diagram text
  App->>Engine: renderMermaid(source, theme)
  Engine-->>App: SVG output
  App-->>Browser: Interactive preview`,
  State: `stateDiagram-v2
  [*] --> Idle
  Idle --> Editing: User types
  Editing --> Rendering: Source changed
  Rendering --> Ready: Render success
  Rendering --> Failed: Parse error
  Failed --> Editing: Fix syntax
  Ready --> Exporting: Download SVG/PNG
  Exporting --> Ready
  Ready --> [*]`,
  Class: `classDiagram
  class MermaidStudio {
    +string source
    +ThemeMode mode
    +RenderStyle style
    +render()
    +downloadSvg()
    +downloadPng(scale)
  }
  class Renderer {
    +renderMermaid(source, options)
    +renderMermaidAscii(source, options)
  }
  MermaidStudio --> Renderer : uses`,
  ER: `erDiagram
  USER ||--o{ DIAGRAM : creates
  DIAGRAM ||--o{ RENDER : produces
  DIAGRAM {
    string id
    string title
    text source
  }
  RENDER {
    string format
    string theme
    datetime renderedAt
  }`,
} as const;

type DiagramPreset = keyof typeof DIAGRAM_PRESETS;
const DEFAULT_PRESET: DiagramPreset = "Flowchart";
const PRESET_SOURCES = new Set<string>(Object.values(DIAGRAM_PRESETS));
const SHIKI_FALLBACK_THEME_BY_MODE = { light: "github-light", dark: "github-dark" } as const;
const SHIKI_THEME_BY_MERMAID_THEME = {
  "catppuccin-latte": { light: "catppuccin-latte", dark: "catppuccin-mocha" },
  "catppuccin-mocha": { light: "catppuccin-latte", dark: "catppuccin-mocha" },
  dracula: "dracula",
  "github-dark": { light: "github-light", dark: "github-dark" },
  "github-light": { light: "github-light", dark: "github-dark" },
  nord: "nord",
  "nord-light": "nord",
  "one-dark": "one-dark-pro",
  "solarized-dark": { light: "solarized-light", dark: "solarized-dark" },
  "solarized-light": { light: "solarized-light", dark: "solarized-dark" },
  "tokyo-night": "tokyo-night",
  "tokyo-night-light": "tokyo-night",
  "tokyo-night-storm": "tokyo-night",
  "zinc-dark": { light: "github-light", dark: "github-dark" },
} as const satisfies Partial<Record<ThemeName, string | Record<ThemeMode, string>>>;

let globalShikiHighlighterPromise: Promise<Awaited<ReturnType<typeof createHighlighterCore>>> | null = null;

function getShikiThemeName(theme: ThemeName, mode: ThemeMode): string {
  const mappedTheme = SHIKI_THEME_BY_MERMAID_THEME[theme as keyof typeof SHIKI_THEME_BY_MERMAID_THEME];
  if (!mappedTheme) return SHIKI_FALLBACK_THEME_BY_MODE[mode];
  return typeof mappedTheme === "string" ? mappedTheme : mappedTheme[mode];
}

function getGlobalShikiHighlighter() {
  if (!globalShikiHighlighterPromise) {
    globalShikiHighlighterPromise = createHighlighterCore({
      themes: [
        themeCatppuccinLatte,
        themeCatppuccinMocha,
        themeDracula,
        themeGithubDark,
        themeGithubLight,
        themeNord,
        themeOneDarkPro,
        themeSolarizedDark,
        themeSolarizedLight,
        themeTokyoNight,
      ],
      langs: [langMermaid],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return globalShikiHighlighterPromise;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderShikiTokenLines(
  lines: Array<Array<{ content: string; color?: string | undefined; fontStyle?: number | undefined }>>,
  fallbackColor: string,
): string {
  return lines
    .map(line => {
      if (line.length === 0) return " ";
      return line
        .map(token => {
          const styles = [`color:${token.color ?? fallbackColor}`];
          if ((token.fontStyle ?? 0) & 1) styles.push("font-style:italic");
          if ((token.fontStyle ?? 0) & 2) styles.push("font-weight:700");
          if ((token.fontStyle ?? 0) & 4) styles.push("text-decoration:underline");
          return `<span style=\"${styles.join(";")}\">${escapeHtml(token.content)}</span>`;
        })
        .join("");
    })
    .join("\n");
}

async function buildShareUrlForSource(source: string, currentUrl: URL): Promise<URL> {
  if (source.trim().length === 0 || PRESET_SOURCES.has(source)) {
    return clearDiagramTokenFromUrl(currentUrl);
  }
  const token = await encodeDiagramToken(source);
  return writeDiagramTokenToUrl(currentUrl, token);
}

/* ─── Utilities ─── */

function getPreferredMode(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function extractSvgSize(svgMarkup: string): SvgSize | null {
  if (typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const values = viewBox.trim().split(/\s+/).map(Number.parseFloat).filter(Number.isFinite);
    if (values.length === 4 && values[2] > 0 && values[3] > 0) {
      return { width: values[2], height: values[3] };
    }
  }

  const width = Number.parseFloat(svg.getAttribute("width") ?? "");
  const height = Number.parseFloat(svg.getAttribute("height") ?? "");
  return width > 0 && height > 0 ? { width, height } : null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load SVG for PNG export."));
    image.src = url;
  });
}

function triggerDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/* ─── Shared UI pieces ─── */

function ButtonGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center divide-x divide-border overflow-hidden rounded-md border border-border shadow-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ButtonGroupItem({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 bg-card px-2.5 py-1.5 text-xs font-medium text-card-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function PanelHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PanelTab({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-primary" />
      <span className="text-sm font-semibold tracking-tight">{label}</span>
    </div>
  );
}

function Badge({ children, dot }: { children: ReactNode; dot?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[0.68rem] font-medium text-muted-foreground">
      {dot && (
        <span
          className="size-1.5 rounded-full bg-primary"
          style={{ animation: "pulse-dot 2s ease-in-out infinite" }}
        />
      )}
      {children}
    </span>
  );
}

/* ─── Main App ─── */

export function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getPreferredMode());
  const [mermaidTheme, setMermaidTheme] = useState<ThemeName>(() => MERMAID_THEME_BY_MODE[getPreferredMode()]);
  const [renderStyle, setRenderStyle] = useState<RenderStyle>("svg");
  const [pngScale, setPngScale] = useState<(typeof PNG_SCALES)[number]>(2);
  const [activePreset, setActivePreset] = useState<DiagramPreset>(DEFAULT_PRESET);
  const [source, setSource] = useState<string>(DIAGRAM_PRESETS[DEFAULT_PRESET]);
  const [sourceHighlightHtml, setSourceHighlightHtml] = useState("");
  const [hasHydratedShareLink, setHasHydratedShareLink] = useState(false);

  const [svgMarkup, setSvgMarkup] = useState("");
  const [asciiMarkup, setAsciiMarkup] = useState("");
  const [renderError, setRenderError] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [exporting, setExporting] = useState<"svg" | "png" | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(false);

  const [svgSize, setSvgSize] = useState<SvgSize | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 });

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const sourceHighlightContentRef = useRef<HTMLPreElement | null>(null);
  const transformRef = useRef<Transform>(transform);
  const dragRef = useRef<DragState | null>(null);
  const requestIdRef = useRef<number>(0);
  const actionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const availableThemes = useMemo(() => Object.keys(THEMES).sort() as ThemeName[], []);
  const shikiTheme = useMemo(() => getShikiThemeName(mermaidTheme, themeMode), [mermaidTheme, themeMode]);

  useEffect(() => { transformRef.current = transform; }, [transform]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", themeMode === "dark");
    root.style.colorScheme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    const modeDefaultTheme = MERMAID_THEME_BY_MODE[themeMode];
    setMermaidTheme(current =>
      current === MERMAID_THEME_BY_MODE.light || current === MERMAID_THEME_BY_MODE.dark
        ? modeDefaultTheme
        : current,
    );
  }, [themeMode]);

  useEffect(() => {
    let isCancelled = false;
    void (async () => {
      try {
        const highlighter = await getGlobalShikiHighlighter();
        const fencedSource = `\`\`\`mermaid\n${source || " "}\n\`\`\``;
        const tokenResult = highlighter.codeToTokens(fencedSource, {
          lang: "mermaid",
          theme: shikiTheme,
        });
        const contentLines = tokenResult.tokens.slice(1, -1);
        const html = renderShikiTokenLines(contentLines, tokenResult.fg);
        if (!isCancelled) {
          setSourceHighlightHtml(html);
        }
      } catch {
        if (!isCancelled) {
          setSourceHighlightHtml("");
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [shikiTheme, source]);

  const showActionMessage = useCallback((message: string, isError = false) => {
    setActionMessage(message);
    setActionError(isError);
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    actionTimeoutRef.current = setTimeout(() => {
      setActionMessage("");
      setActionError(false);
    }, 3000);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isCancelled = false;
    (async () => {
      try {
        const currentUrl = new URL(window.location.href);
        const token = readDiagramTokenFromUrl(currentUrl);
        if (!token) return;
        const decoded = await decodeDiagramToken(token);
        if (isCancelled) return;
        setSource(decoded);

        const canonicalUrl = writeDiagramTokenToUrl(currentUrl, token);
        if (canonicalUrl.toString() !== currentUrl.toString()) {
          window.history.replaceState(null, "", canonicalUrl);
        }
      } catch {
        if (!isCancelled) {
          showActionMessage("Invalid share link", true);
        }
      } finally {
        if (!isCancelled) {
          setHasHydratedShareLink(true);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [showActionMessage]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasHydratedShareLink) return;

    let isCancelled = false;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const currentUrl = new URL(window.location.href);
          const nextUrl = await buildShareUrlForSource(source, currentUrl);
          if (!isCancelled && nextUrl.toString() !== currentUrl.toString()) {
            window.history.replaceState(null, "", nextUrl);
          }
        } catch {}
      })();
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [hasHydratedShareLink, source]);

  const getRenderOptions = useCallback(
    () => ({ ...THEMES[mermaidTheme], font: "DM Sans", padding: 36 }),
    [mermaidTheme],
  );

  const renderSvgSnapshot = useCallback(async () => {
    const renderedSvg = await renderMermaid(source, getRenderOptions());
    setSvgMarkup(renderedSvg);
    setSvgSize(extractSvgSize(renderedSvg));
    return renderedSvg;
  }, [getRenderOptions, source]);

  const createPngBlobFromSvg = useCallback(async (svg: string, scale: number) => {
    let svgUrl = "";
    try {
      const rawSvgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      svgUrl = URL.createObjectURL(rawSvgBlob);
      const image = await loadImage(svgUrl);
      const measuredSize = extractSvgSize(svg);
      const width = measuredSize?.width ?? image.width;
      const height = measuredSize?.height ?? image.height;
      if (!width || !height) throw new Error("Could not calculate PNG dimensions from rendered SVG.");

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not initialize PNG canvas context.");
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.drawImage(image, 0, 0);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("PNG export failed."))), "image/png");
      });
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
    }
  }, []);

  const fitToView = useCallback(() => {
    if (!svgSize || !viewportRef.current) return;
    const vp = viewportRef.current;
    const pad = 48;
    const rawScale = Math.min((vp.clientWidth - pad) / svgSize.width, (vp.clientHeight - pad) / svgSize.height);
    const scale = clamp(rawScale, MIN_SCALE, MAX_SCALE);
    setTransform({
      scale,
      x: (vp.clientWidth - svgSize.width * scale) / 2,
      y: (vp.clientHeight - svgSize.height * scale) / 2,
    });
  }, [svgSize]);

  // Render effect
  useEffect(() => {
    const requestId = ++requestIdRef.current;
    (async () => {
      setIsRendering(true);
      setRenderError("");
      try {
        if (renderStyle === "svg") {
          const svg = await renderMermaid(source, getRenderOptions());
          if (requestId !== requestIdRef.current) return;
          setSvgMarkup(svg);
          setAsciiMarkup("");
          setSvgSize(extractSvgSize(svg));
        } else {
          const ascii = renderMermaidAscii(source, { useAscii: renderStyle === "ascii" });
          if (requestId !== requestIdRef.current) return;
          setAsciiMarkup(ascii);
          setSvgMarkup("");
          setSvgSize(null);
        }
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setRenderError(error instanceof Error ? error.message : String(error));
        setSvgMarkup("");
        setAsciiMarkup("");
        setSvgSize(null);
      } finally {
        if (requestId === requestIdRef.current) setIsRendering(false);
      }
    })();
  }, [getRenderOptions, renderStyle, source]);

  // Auto-fit on render
  useEffect(() => {
    if (renderStyle !== "svg" || !svgMarkup || !svgSize) return;
    const frame = requestAnimationFrame(() => fitToView());
    return () => cancelAnimationFrame(frame);
  }, [fitToView, renderStyle, svgMarkup, svgSize]);

  // Zoom helpers
  const applyZoomAroundPoint = useCallback((nextScale: number, anchorX: number, anchorY: number) => {
    setTransform(cur => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const wx = (anchorX - cur.x) / cur.scale;
      const wy = (anchorY - cur.y) / cur.scale;
      return { scale, x: anchorX - wx * scale, y: anchorY - wy * scale };
    });
  }, []);

  const zoomToScale = useCallback(
    (nextScale: number) => {
      if (!viewportRef.current) return;
      const cx = viewportRef.current.clientWidth / 2;
      const cy = viewportRef.current.clientHeight / 2;
      applyZoomAroundPoint(nextScale, cx, cy);
    },
    [applyZoomAroundPoint],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      zoomToScale(transformRef.current.scale * factor);
    },
    [zoomToScale],
  );

  // Pointer / wheel handlers
  const handleWheelZoom = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      applyZoomAroundPoint(
        transformRef.current.scale * (event.deltaY < 0 ? 1.08 : 0.92),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    },
    [applyZoomAroundPoint],
  );

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: transformRef.current.x,
      startY: transformRef.current.y,
    };
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setTransform(cur => ({
      ...cur,
      x: drag.startX + event.clientX - drag.startClientX,
      y: drag.startY + event.clientY - drag.startClientY,
    }));
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  }, []);

  // Export handlers
  const handleSvgDownload = useCallback(async () => {
    setExporting("svg");
    try {
      const svg = await renderSvgSnapshot();
      triggerDownload(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `diagram-${Date.now()}.svg`);
      showActionMessage("SVG downloaded");
    } catch (error) {
      showActionMessage(error instanceof Error ? error.message : String(error), true);
    } finally {
      setExporting(null);
    }
  }, [renderSvgSnapshot, showActionMessage]);

  const handlePngDownload = useCallback(async () => {
    setExporting("png");
    try {
      const svg = await renderSvgSnapshot();
      const pngBlob = await createPngBlobFromSvg(svg, pngScale);
      triggerDownload(pngBlob, `diagram-${Date.now()}-${pngScale}x.png`);
      showActionMessage(`PNG downloaded (${pngScale}x)`);
    } catch (error) {
      showActionMessage(error instanceof Error ? error.message : String(error), true);
    } finally {
      setExporting(null);
    }
  }, [createPngBlobFromSvg, pngScale, renderSvgSnapshot, showActionMessage]);

  const handleCopySvg = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(await renderSvgSnapshot());
      showActionMessage("SVG copied");
    } catch (error) {
      showActionMessage(error instanceof Error ? error.message : String(error), true);
    }
  }, [renderSvgSnapshot, showActionMessage]);

  const handleCopyPng = useCallback(async () => {
    try {
      if (typeof ClipboardItem === "undefined" || typeof navigator.clipboard.write !== "function") {
        throw new Error("PNG clipboard copy is not supported in this browser.");
      }
      const svg = await renderSvgSnapshot();
      const pngBlob = await createPngBlobFromSvg(svg, pngScale);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      showActionMessage(`PNG copied (${pngScale}x)`);
    } catch (error) {
      showActionMessage(error instanceof Error ? error.message : String(error), true);
    }
  }, [createPngBlobFromSvg, pngScale, renderSvgSnapshot, showActionMessage]);

  const handleCopyAscii = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(renderMermaidAscii(source, { useAscii: true }));
      showActionMessage("ASCII copied");
    } catch (error) {
      showActionMessage(error instanceof Error ? error.message : String(error), true);
    }
  }, [showActionMessage, source]);

  const handleCopyShareLink = useCallback(async () => {
    try {
      if (typeof window === "undefined") {
        throw new Error("Share links are only available in a browser.");
      }
      const currentUrl = new URL(window.location.href);
      const shareUrl = await buildShareUrlForSource(source, currentUrl);
      if (shareUrl.toString() !== currentUrl.toString()) {
        window.history.replaceState(null, "", shareUrl);
      }
      await navigator.clipboard.writeText(shareUrl.toString());
      showActionMessage("Share link copied");
    } catch (error) {
      showActionMessage(error instanceof Error ? error.message : String(error), true);
    }
  }, [showActionMessage, source]);

  const applySelectedPreset = useCallback(() => {
    setSource(DIAGRAM_PRESETS[activePreset]);
    showActionMessage(`Applied ${activePreset} preset`);
  }, [activePreset, showActionMessage]);

  const syncSourceHighlightScroll = useCallback((scrollLeft: number, scrollTop: number) => {
    if (!sourceHighlightContentRef.current) return;
    sourceHighlightContentRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  }, []);

  const handleSourceEditorScroll = useCallback((event: React.UIEvent<HTMLTextAreaElement>) => {
    syncSourceHighlightScroll(event.currentTarget.scrollLeft, event.currentTarget.scrollTop);
  }, [syncSourceHighlightScroll]);

  useEffect(() => {
    const editor = sourceTextareaRef.current;
    if (!editor) return;
    syncSourceHighlightScroll(editor.scrollLeft, editor.scrollTop);
  }, [sourceHighlightHtml, syncSourceHighlightScroll]);

  const lineCount = source.split("\n").length;
  const isBusy = isRendering || exporting !== null;
  const isSvgReady = renderStyle === "svg" && !!svgMarkup;

  return (
    <div className="relative z-10 mx-auto w-full max-w-[1680px] p-3 md:p-4 lg:px-6">
      {/* Body dot pattern */}
      <div className="dot-pattern pointer-events-none fixed inset-0 z-0" />

      {/* Ambient glow */}
      <div className="pointer-events-none fixed -top-[20%] left-[10%] right-[10%] z-0 h-[50vh] opacity-60 blur-[60px]">
        <div className="h-full w-full rounded-full bg-primary/15" />
      </div>

      {/* ─── Top bar ─── */}
      <Card className="reveal-up mb-3 flex-row items-center justify-between gap-3 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L2 12h3v8h6v-5h2v5h6v-8h3L12 3z" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight" data-display-font>
            Mermaid Studio
          </span>
          <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <Badge dot>{mermaidTheme}</Badge>
        </div>

        <div className="flex items-center gap-2">
          <Select value={mermaidTheme} onValueChange={v => setMermaidTheme(v as ThemeName)}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <Palette className="size-3.5 shrink-0 opacity-60" />
              <SelectValue placeholder="Theme" />
            </SelectTrigger>
            <SelectContent>
              {availableThemes.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 rounded-lg px-2.5 text-xs"
            onClick={handleCopyShareLink}
            title="Copy share link"
          >
            <Link2 className="size-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>

          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-lg"
            onClick={() => setThemeMode(m => (m === "dark" ? "light" : "dark"))}
            title={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {themeMode === "dark" ? <SunMedium className="size-4" /> : <MoonStar className="size-4" />}
          </Button>
        </div>
      </Card>

      {/* ─── Workspace ─── */}
      <main className="grid min-h-[calc(100vh-8rem)] gap-3 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)]">
        {/* ─── Source Editor ─── */}
        <Card className="reveal-up flex flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-sm" style={{ animationDelay: "60ms" }}>
          {/* Header */}
          <PanelHeader>
            <PanelTab icon={Code2} label="Source" />
            <div className="flex items-center gap-2">
              <Select value={activePreset} onValueChange={v => setActivePreset(v as DiagramPreset)}>
                <SelectTrigger className="h-7 w-[132px] text-xs" title="Choose a preset to apply">
                  <SelectValue placeholder="Choose preset" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(DIAGRAM_PRESETS).map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={applySelectedPreset}
                title="Apply selected preset"
              >
                Apply preset
              </Button>
            </div>
          </PanelHeader>

          {/* Editor */}
          <div className="relative flex flex-1" style={{ minHeight: "50vh" }}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden px-4 py-3 font-mono text-[0.82rem] leading-relaxed"
            >
              {sourceHighlightHtml ? (
                <pre
                  ref={sourceHighlightContentRef}
                  className="m-0 whitespace-pre-wrap break-words will-change-transform"
                  style={{ tabSize: 2 }}
                  dangerouslySetInnerHTML={{ __html: sourceHighlightHtml }}
                />
              ) : (
                <pre
                  ref={sourceHighlightContentRef}
                  className="m-0 whitespace-pre-wrap break-words text-foreground will-change-transform"
                  style={{ tabSize: 2 }}
                >
                  {source || " "}
                </pre>
              )}
            </div>

            <textarea
              ref={sourceTextareaRef}
              value={source}
              onChange={e => setSource(e.target.value)}
              onScroll={handleSourceEditorScroll}
              spellCheck={false}
              className="relative z-10 flex-1 resize-none border-none bg-transparent px-4 py-3 font-mono text-[0.82rem] leading-relaxed text-transparent caret-foreground outline-none selection:bg-primary/30 selection:text-foreground placeholder:text-muted-foreground"
              style={{ minHeight: "50vh", tabSize: 2 }}
              placeholder="Enter Mermaid diagram syntax..."
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-1.5 text-[0.7rem] text-muted-foreground">
            <span>{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
            <span>flowchart, sequence, state, class, ER</span>
          </div>
        </Card>

        {/* ─── Preview ─── */}
        <Card className="reveal-up flex flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-sm" style={{ animationDelay: "120ms" }}>
          {/* Header */}
          <PanelHeader>
            <div className="flex items-center gap-2">
              <PanelTab icon={Eye} label="Preview" />
              {renderStyle !== "svg" && <Badge>text mode</Badge>}
            </div>
          </PanelHeader>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-2">
            <Select value={renderStyle} onValueChange={v => setRenderStyle(v as RenderStyle)}>
              <SelectTrigger className="h-7 w-[145px] text-xs">
                {renderStyle === "svg" ? (
                  <FileImage className="size-3 shrink-0 opacity-60" />
                ) : (
                  <Terminal className="size-3 shrink-0 opacity-60" />
                )}
                <SelectValue placeholder="Render" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="svg">SVG (interactive)</SelectItem>
                <SelectItem value="unicode">ASCII + Unicode</SelectItem>
                <SelectItem value="ascii">ASCII only</SelectItem>
              </SelectContent>
            </Select>

            {/* Copy group */}
            <ButtonGroup>
              <ButtonGroupItem onClick={handleCopySvg} disabled={isBusy} title="Copy SVG markup">
                <Copy className="size-3" /> SVG
              </ButtonGroupItem>
              <ButtonGroupItem onClick={handleCopyPng} disabled={isBusy} title="Copy PNG to clipboard">
                <Copy className="size-3" /> PNG
              </ButtonGroupItem>
              <ButtonGroupItem onClick={handleCopyAscii} disabled={isBusy} title="Copy ASCII to clipboard">
                <ClipboardCopy className="size-3" /> ASCII
              </ButtonGroupItem>
            </ButtonGroup>

            {/* Download group */}
            <ButtonGroup>
              <ButtonGroupItem onClick={handleSvgDownload} disabled={isBusy}>
                <Download className="size-3" /> {exporting === "svg" ? "..." : "SVG"}
              </ButtonGroupItem>
              <ButtonGroupItem onClick={handlePngDownload} disabled={isBusy}>
                <Download className="size-3" /> {exporting === "png" ? "..." : "PNG"}
              </ButtonGroupItem>
            </ButtonGroup>

            <Select value={String(pngScale)} onValueChange={v => setPngScale(Number(v) as (typeof PNG_SCALES)[number])}>
              <SelectTrigger className="h-7 w-[68px] text-xs">
                <SelectValue placeholder="Scale" />
              </SelectTrigger>
              <SelectContent>
                {PNG_SCALES.map(s => (
                  <SelectItem key={s} value={String(s)}>{s}x</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isSvgReady && (
              <>
                <div className="mx-0.5 h-4 w-px bg-border" />
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={fitToView}>
                  <ScanSearch className="size-3" /> Fit
                </Button>
              </>
            )}
          </div>

          {/* Viewport */}
          <div className="relative flex-1">
            <div
              ref={viewportRef}
              className={cn(
                "viewport-dots absolute inset-0 bg-muted/30",
                isSvgReady
                  ? "overflow-hidden cursor-grab active:cursor-grabbing"
                  : "overflow-auto cursor-default",
              )}
              style={{ minHeight: "50vh" }}
              onWheel={isSvgReady ? handleWheelZoom : undefined}
              onPointerDown={isSvgReady ? handlePointerDown : undefined}
              onPointerMove={isSvgReady ? handlePointerMove : undefined}
              onPointerUp={isSvgReady ? handlePointerUp : undefined}
              onPointerCancel={isSvgReady ? handlePointerUp : undefined}
            >
              {isSvgReady && (
                <div
                  className="diagram-stage"
                  style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
                >
                  <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
                </div>
              )}

              {renderStyle !== "svg" && asciiMarkup && (
                <pre className="m-0 h-full min-h-[50vh] whitespace-pre p-5 font-mono text-[0.82rem] leading-snug">
                  {asciiMarkup}
                </pre>
              )}

              {isRendering && (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted-foreground backdrop-blur-xl">
                  <span className="size-1.5 rounded-full bg-primary" style={{ animation: "pulse-dot 1.2s ease-in-out infinite" }} />
                  Rendering
                </div>
              )}

              {renderError && (
                <p className="absolute inset-x-3 bottom-3 m-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-snug text-destructive backdrop-blur-xl">
                  {renderError}
                </p>
              )}

              {actionMessage && (
                <div
                  className={cn(
                    "absolute left-1/2 top-3 z-10 flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-card/80 px-3 py-1 text-xs font-medium shadow-lg backdrop-blur-xl",
                    actionError ? "border-destructive/30 text-destructive" : "border-border text-foreground",
                  )}
                  style={{ animation: "toast-in 300ms cubic-bezier(0.16, 1, 0.3, 1)", transform: "translateX(-50%)" }}
                >
                  {!actionError && <Check className="size-3" />}
                  {actionMessage}
                </div>
              )}

              {/* Zoom controls */}
              {isSvgReady && (
                <div
                  className="absolute bottom-3 right-3 flex items-center overflow-hidden rounded-lg border border-border bg-card/80 shadow-md backdrop-blur-xl"
                  onPointerDown={event => event.stopPropagation()}
                  onPointerMove={event => event.stopPropagation()}
                  onPointerUp={event => event.stopPropagation()}
                  onPointerCancel={event => event.stopPropagation()}
                  onWheel={event => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => zoomByFactor(0.9)}
                    title="Zoom out"
                  >
                    <Minus className="size-3" />
                  </button>
                  <button
                    type="button"
                    className="flex h-7 min-w-[3rem] items-center justify-center border-x border-border px-1 font-mono text-[0.68rem] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => zoomToScale(1)}
                    title="Reset zoom to 100%"
                  >
                    {Math.round(transform.scale * 100)}%
                  </button>
                  <button
                    type="button"
                    className="flex size-7 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => zoomByFactor(1.1)}
                    title="Zoom in"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}

export default App;
