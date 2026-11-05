"use client";

/** Renders a Word Hug as a 1080×1350 keepsake image, entirely on-device. */
export async function renderHugImage(opts: {
  kicker: string;
  headline: string;
  paragraphs: string[];
  signature: string;
}): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const pad = 96;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;

  const serif = '"Fraunces Variable", Georgia, serif';
  const sans = '"Instrument Sans Variable", system-ui, sans-serif';
  try {
    await Promise.all([
      document.fonts.load(`400 40px ${serif}`),
      document.fonts.load(`italic 400 40px ${serif}`),
      document.fonts.load(`600 20px ${sans}`),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  // paper
  ctx.fillStyle = "#f6efe6";
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, -200, 50, W / 2, -200, 1100);
  g.addColorStop(0, "rgba(242,214,200,0.9)");
  g.addColorStop(1, "rgba(242,214,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // card
  const cx = 56;
  const cy = 56;
  const cw = W - 112;
  const ch = H - 112;
  ctx.save();
  ctx.shadowColor = "rgba(36,28,23,0.18)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = "#fffaf3";
  roundRect(ctx, cx, cy, cw, ch, 44);
  ctx.fill();
  ctx.restore();

  const maxW = cw - pad * 2 + 56;
  let y = cy + pad;
  const x = cx + pad - 28;

  ctx.fillStyle = "#b4472a";
  ctx.font = `600 22px ${sans}`;
  ctx.letterSpacing = "4px";
  ctx.fillText(opts.kicker.toUpperCase(), x, y);
  ctx.letterSpacing = "0px";
  y += 76;

  ctx.fillStyle = "#241c17";
  ctx.font = `400 64px ${serif}`;
  for (const line of wrap(ctx, opts.headline, maxW)) {
    ctx.fillText(line, x, y);
    y += 70;
  }
  y += 26;

  // body: shrink to fit
  const bottomLimit = cy + ch - pad - 90;
  let size = 38;
  let lines: { t: string; gap: boolean }[] = [];
  for (; size >= 24; size -= 2) {
    ctx.font = `400 ${size}px ${serif}`;
    lines = [];
    opts.paragraphs.forEach((p, k) => {
      wrap(ctx, p, maxW).forEach((t, j) => lines.push({ t, gap: j === 0 && k > 0 }));
    });
    const lh = size * 1.38;
    const total = lines.length * lh + lines.filter((l) => l.gap).length * size * 0.7;
    if (y + total < bottomLimit) break;
  }
  const lh = size * 1.38;
  ctx.font = `400 ${size}px ${serif}`;
  ctx.fillStyle = "#241c17";
  for (const l of lines) {
    if (l.gap) y += size * 0.7;
    ctx.fillText(l.t, x, y);
    y += lh;
  }

  ctx.font = `italic 400 34px ${serif}`;
  ctx.fillStyle = "#5e5148";
  ctx.fillText(opts.signature, x, Math.min(y + 40, cy + ch - pad - 30));

  // footer mark
  ctx.font = `500 22px ${sans}`;
  ctx.fillStyle = "#8f8177";
  ctx.fillText("Sometimes you just need a Word Hug.", x, cy + ch - 56);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("render failed"))), "image/png"));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      out.push(line);
      line = w;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
