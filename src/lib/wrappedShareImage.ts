import { MASCOT_PIXELS, MASCOT_SIZE } from "@/lib/mascotPixels";
import { traitNames } from "@/lib/wrappedPresentation";
import type { WrappedReport } from "@/lib/analysis/wrapped";
import type { Dictionary } from "@/i18n/types";
import type { WrappedFormatters } from "@/components/wrapped/WrappedCardPanel";

/** Formato storia (Instagram/WhatsApp): la card è pensata per essere condivisa così com'è. */
const WIDTH = 1080;
const HEIGHT = 1920;
const MARGIN = 72;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;

/**
 * Riprende i token di globals.css: un canvas offscreen non ha accesso a `var(--...)`,
 * quindi i colori del tema sono duplicati qui a mano.
 */
const COLOR = {
  background: "#090c09",
  surface: "#0f130f",
  border: "#232b21",
  borderStrong: "#37452f",
  foreground: "#e6f1e1",
  muted: "#7d8f76",
  accent: "#4ade80",
  accentStrong: "#8bffb0",
  amber: "#f0b429",
  danger: "#f87171",
};

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Non ancora su tutti i motori: la card resta leggibile anche senza.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

function resetLetterSpacing(ctx: CanvasRenderingContext2D) {
  setLetterSpacing(ctx, 0);
}

/** Spezza il testo sulle parole entro `maxWidth`, troncando con "…" oltre `maxLines`. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let consumed = 0;

  while (consumed < words.length) {
    const word = words[consumed];
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      consumed += 1;
    } else {
      lines.push(line);
      line = "";
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line);
    consumed = words.length;
  }

  if (consumed < words.length) {
    let last = lines[lines.length - 1] ?? "";
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${last}…`;
  }

  return lines;
}

/** Riduce il font finché `text` non entra in `maxWidth`, senza scendere sotto `minSize`. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  weight: number,
  startSize: number,
  minSize: number,
  maxWidth: number,
) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

/**
 * Come `fitFontSize`, ma se anche al corpo minimo il testo non entra (nomi di registi o
 * generi molto lunghi) lo tronca con "…" invece di lasciarlo uscire dalla colonna.
 */
function fitOrTruncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  weight: number,
  startSize: number,
  minSize: number,
  maxWidth: number,
) {
  const size = fitFontSize(ctx, text, fontFamily, weight, startSize, minSize, maxWidth);
  ctx.font = `${weight} ${size}px ${fontFamily}`;
  if (ctx.measureText(text).width <= maxWidth) return { size, text };

  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return { size, text: `${truncated.trimEnd()}…` };
}

function drawMascot(ctx: CanvasRenderingContext2D, originX: number, originY: number, scale: number) {
  for (const [x, y, w, fill] of MASCOT_PIXELS) {
    ctx.fillStyle = fill;
    ctx.fillRect(originX + x * scale, originY + y * scale, w * scale, scale);
  }
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = COLOR.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(WIDTH / 2, 480, 0, WIDTH / 2, 480, 760);
  glow.addColorStop(0, withAlpha(COLOR.accent, 0.14));
  glow.addColorStop(1, withAlpha(COLOR.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Scanline sottilissime: la stessa estetica CRT dell'overlay del sito.
  ctx.fillStyle = withAlpha("#ffffff", 0.035);
  for (let y = 0; y < HEIGHT; y += 3) ctx.fillRect(0, y, WIDTH, 1);
}

function drawChrome(ctx: CanvasRenderingContext2D, fontFamily: string) {
  const height = 64;
  ctx.fillStyle = COLOR.surface;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height);
  ctx.lineTo(WIDTH, height);
  ctx.stroke();

  const dotY = height / 2;
  const dotColors = [COLOR.danger, COLOR.amber, COLOR.accent];
  dotColors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(MARGIN - 32 + i * 32, dotY, 8, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = COLOR.muted;
  ctx.font = `400 22px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setLetterSpacing(ctx, 2);
  ctx.fillText("tastr — wrapped.sh", WIDTH / 2, dotY);
  resetLetterSpacing(ctx);
  ctx.textAlign = "left";
}

function drawHeader(ctx: CanvasRenderingContext2D, fontFamily: string, year: number, eyebrow: string) {
  const top = CONTENT_TOP;
  const mascotScale = 4;
  drawMascot(ctx, MARGIN, top, mascotScale);

  const textX = MARGIN + MASCOT_SIZE * mascotScale + 32;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLOR.accent;
  ctx.font = `600 26px ${fontFamily}`;
  setLetterSpacing(ctx, 2);
  ctx.fillText(eyebrow.toUpperCase(), textX, top + 44);
  resetLetterSpacing(ctx);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = `700 68px ${fontFamily}`;
  ctx.fillText(String(year), textX, top + 112);

  return top + MASCOT_SIZE * mascotScale + 40;
}

function drawDivider(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(WIDTH - MARGIN, y);
  ctx.stroke();
  return y + 48;
}

/** Il verdetto: `[ NOME ]` enorme e con il bagliore accent, come .bracket-label + .text-glow nel sito. */
function drawArchetype(ctx: CanvasRenderingContext2D, fontFamily: string, y: number, label: string, name: string) {
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COLOR.muted;
  ctx.font = `600 26px ${fontFamily}`;
  setLetterSpacing(ctx, 3);
  ctx.fillText(label.toUpperCase(), MARGIN, y);
  resetLetterSpacing(ctx);

  const headlineY = y + 130;
  const upper = name.toUpperCase();
  const bracketed = `[ ${upper} ]`;
  const size = fitFontSize(ctx, bracketed, fontFamily, 700, 96, 48, CONTENT_WIDTH);
  ctx.font = `700 ${size}px ${fontFamily}`;

  const openWidth = ctx.measureText("[ ").width;
  const nameWidth = ctx.measureText(upper).width;
  const totalWidth = ctx.measureText(bracketed).width;
  let x = (WIDTH - totalWidth) / 2;

  ctx.fillStyle = withAlpha(COLOR.muted, 0.5);
  ctx.fillText("[ ", x, headlineY);
  x += openWidth;

  ctx.save();
  ctx.shadowColor = withAlpha(COLOR.accent, 0.55);
  ctx.shadowBlur = 28;
  ctx.fillStyle = COLOR.accent;
  ctx.fillText(upper, x, headlineY);
  ctx.restore();
  x += nameWidth;

  ctx.fillStyle = withAlpha(COLOR.muted, 0.5);
  ctx.fillText(" ]", x, headlineY);

  return headlineY + 70;
}

function drawParagraph(ctx: CanvasRenderingContext2D, fontFamily: string, y: number, text: string) {
  ctx.fillStyle = withAlpha(COLOR.foreground, 0.92);
  ctx.font = `400 34px ${fontFamily}`;
  const lines = wrapText(ctx, text, CONTENT_WIDTH, 4);
  const lineHeight = 46;
  lines.forEach((line, i) => ctx.fillText(line, MARGIN, y + i * lineHeight));
  return y + lines.length * lineHeight + 20;
}

interface Stat {
  label: string;
  value: string;
}

function drawStatGrid(ctx: CanvasRenderingContext2D, fontFamily: string, y: number, stats: Stat[]) {
  const columns = 2;
  const gap = 40;
  const cellWidth = (CONTENT_WIDTH - gap) / columns;
  const rowHeight = 128;

  stats.forEach((stat, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = MARGIN + col * (cellWidth + gap);
    const rowY = y + row * rowHeight;

    ctx.fillStyle = COLOR.muted;
    ctx.font = `600 22px ${fontFamily}`;
    setLetterSpacing(ctx, 2);
    ctx.fillText(stat.label.toUpperCase(), x, rowY);
    resetLetterSpacing(ctx);

    ctx.fillStyle = COLOR.foreground;
    const { size, text } = fitOrTruncate(ctx, stat.value, fontFamily, 700, 44, 26, cellWidth);
    ctx.font = `700 ${size}px ${fontFamily}`;
    ctx.fillText(text, x, rowY + 46);
  });

  const rows = Math.ceil(stats.length / columns);
  return y + rows * rowHeight + 16;
}

/** Il fatto più "da raccontare": il film dell'anno, in un riquadro con accento ambra. */
function drawHighlight(ctx: CanvasRenderingContext2D, fontFamily: string, y: number, label: string, value: string) {
  const paddingX = 36;
  const paddingY = 30;
  ctx.font = `700 40px ${fontFamily}`;
  const valueLines = wrapText(ctx, value, CONTENT_WIDTH - paddingX * 2, 2);
  const boxHeight = paddingY * 2 + 34 + valueLines.length * 50;

  ctx.strokeStyle = withAlpha(COLOR.amber, 0.5);
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN, y, CONTENT_WIDTH, boxHeight);
  ctx.fillStyle = withAlpha(COLOR.amber, 0.06);
  ctx.fillRect(MARGIN, y, CONTENT_WIDTH, boxHeight);

  ctx.fillStyle = COLOR.amber;
  ctx.font = `600 22px ${fontFamily}`;
  setLetterSpacing(ctx, 2);
  ctx.fillText(label.toUpperCase(), MARGIN + paddingX, y + paddingY + 22);
  resetLetterSpacing(ctx);

  ctx.fillStyle = COLOR.foreground;
  ctx.font = `700 40px ${fontFamily}`;
  valueLines.forEach((line, i) => ctx.fillText(line, MARGIN + paddingX, y + paddingY + 68 + i * 50));

  return y + boxHeight + 48;
}

function drawTraits(ctx: CanvasRenderingContext2D, fontFamily: string, y: number, title: string, traits: string[]) {
  if (traits.length === 0) return y;

  ctx.fillStyle = COLOR.muted;
  ctx.font = `600 22px ${fontFamily}`;
  setLetterSpacing(ctx, 2);
  ctx.fillText(title.toUpperCase(), MARGIN, y);
  resetLetterSpacing(ctx);

  let x = MARGIN;
  let rowY = y + 40;
  const paddingX = 20;
  const pillHeight = 52;
  const gap = 14;
  ctx.font = `600 24px ${fontFamily}`;

  for (const trait of traits) {
    const label = trait.toUpperCase();
    // measureText ignora il letterSpacing applicato in fillText: si compensa a mano.
    const w = ctx.measureText(label).width + label.length * 1 + paddingX * 2;
    if (x + w > WIDTH - MARGIN) {
      x = MARGIN;
      rowY += pillHeight + gap;
    }

    ctx.strokeStyle = COLOR.borderStrong;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, rowY, w, pillHeight);
    ctx.fillStyle = COLOR.accent;
    ctx.textBaseline = "middle";
    setLetterSpacing(ctx, 1);
    ctx.fillText(label, x + paddingX, rowY + pillHeight / 2 + 1);
    resetLetterSpacing(ctx);
    ctx.textBaseline = "alphabetic";

    x += w + gap;
  }

  return rowY + pillHeight + 32;
}

function drawFooter(ctx: CanvasRenderingContext2D, fontFamily: string, generatedOn: string) {
  const y = HEIGHT - 96;
  ctx.strokeStyle = COLOR.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(WIDTH - MARGIN, y);
  ctx.stroke();

  const mascotScale = 1.5;
  const mascotY = y + 24;
  drawMascot(ctx, MARGIN, mascotY, mascotScale);

  ctx.textBaseline = "middle";
  const textY = mascotY + (MASCOT_SIZE * mascotScale) / 2;
  ctx.fillStyle = COLOR.accent;
  ctx.font = `700 28px ${fontFamily}`;
  ctx.fillText("tastr", MARGIN + MASCOT_SIZE * mascotScale + 20, textY);

  ctx.fillStyle = COLOR.muted;
  ctx.font = `400 24px ${fontFamily}`;
  ctx.textAlign = "right";
  ctx.fillText(generatedOn, WIDTH - MARGIN, textY);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COLOR.accent;
  ctx.fillRect(0, HEIGHT - 4, WIDTH, 4);
}

const CONTENT_TOP = 132;
const FOOTER_BAND = 176;

/** Corpo della card: intestazione, verdetto, statistiche e tratti. Restituisce la y finale. */
function drawContent(
  ctx: CanvasRenderingContext2D,
  fontFamily: string,
  report: WrappedReport,
  dict: Dictionary["wrapped"],
  format: WrappedFormatters,
) {
  const { summary } = report;
  const archetype = dict.archetypes[summary.archetype];
  const none = dict.summary.none;

  let y = drawHeader(ctx, fontFamily, report.year, dict.eyebrow);
  y = drawDivider(ctx, y);
  y = drawArchetype(ctx, fontFamily, y, dict.summary.title, archetype.name);
  y = drawParagraph(ctx, fontFamily, y, archetype.body);
  y = drawDivider(ctx, y);

  y = drawStatGrid(ctx, fontFamily, y, [
    { label: dict.summary.movies, value: format.count.format(summary.movieCount) },
    { label: dict.summary.viewings, value: format.count.format(summary.viewingCount) },
    { label: dict.summary.rated, value: format.count.format(summary.ratedCount) },
    {
      label: dict.summary.avgRating,
      value: summary.averageRating === null ? none : format.rating.format(summary.averageRating),
    },
    { label: dict.summary.topGenre, value: summary.topGenre ?? none },
    { label: dict.summary.topDirector, value: summary.topDirector ?? none },
  ]);

  if (summary.favouriteMovie) {
    y = drawHighlight(ctx, fontFamily, y, dict.summary.favourite, summary.favouriteMovie);
  }

  return drawTraits(ctx, fontFamily, y, dict.summary.traitsTitle, traitNames(report.cards, dict));
}

/** Disegna la card Wrapped da condividere e la restituisce come PNG. */
export async function renderWrappedShareImage(
  report: WrappedReport,
  dict: Dictionary["wrapped"],
  format: WrappedFormatters,
  lang: string,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponibile");

  if (document.fonts) await document.fonts.ready;
  const fontFamily = getComputedStyle(document.body).fontFamily || "ui-monospace, monospace";

  // Passata "a vuoto" solo per misurare quanto è alto il contenuto vero: la card ha un
  // formato storia fisso, ma un anno con pochi dati non deve lasciare un vuoto in cima.
  const scratch = document.createElement("canvas");
  scratch.width = WIDTH;
  scratch.height = HEIGHT * 2;
  const scratchCtx = scratch.getContext("2d");
  const contentEndY = scratchCtx ? drawContent(scratchCtx, fontFamily, report, dict, format) : CONTENT_TOP;
  const contentHeight = contentEndY - CONTENT_TOP;
  const available = HEIGHT - FOOTER_BAND - CONTENT_TOP;
  const verticalOffset = Math.max(0, (available - contentHeight) / 2);

  drawBackground(ctx);
  drawChrome(ctx, fontFamily);

  ctx.save();
  ctx.translate(0, verticalOffset);
  drawContent(ctx, fontFamily, report, dict, format);
  ctx.restore();

  const generatedOn = new Intl.DateTimeFormat(lang, { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(),
  );
  drawFooter(ctx, fontFamily, generatedOn);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob ha restituito null"))), "image/png");
  });
}
