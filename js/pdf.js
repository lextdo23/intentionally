// A tiny PDF writer, made for the doctor summary (js/doctor.js). No libraries: it writes the PDF by hand.
// Text uses the two fonts every PDF reader already has (Helvetica and Helvetica-Bold), so nothing is embedded.
// Coordinates are in points (1/72 inch) from the TOP left of an A4 page; the writer flips them for PDF.
export const PAGE_W = 595.28, PAGE_H = 841.89;

// Helvetica widths (thousandths of the font size) for the characters 32 to 126, from Adobe's font metrics.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
// Characters outside plain ASCII that the fonts' WinAnsi encoding has, as [byte, regular width, bold width].
const EXTRA = { "’": [0x92, 222, 278], "‘": [0x91, 222, 278], "“": [0x93, 333, 500], "”": [0x94, 333, 500],
  "–": [0x96, 556, 556], "—": [0x97, 1000, 1000], "•": [0x95, 350, 350], "…": [0x85, 1000, 1000], "·": [0xB7, 278, 278] };

// One character -> [byte, width]. Accented letters keep their byte (Latin-1 matches WinAnsi there);
// anything the fonts can't draw (emoji, other alphabets) becomes "?".
function glyph(ch, bold) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return [c, (bold ? W_BOLD : W_REG)[c - 32]];
  if (EXTRA[ch]) return [EXTRA[ch][0], EXTRA[ch][bold ? 2 : 1]];
  if (c >= 0xA0 && c <= 0xFF) return [c, 556];
  if (ch === "\n" || ch === "\t") return [32, 278];
  return [63, bold ? 611 : 556];
}
export function textWidth(s, size, bold = false) {
  let w = 0; for (const ch of String(s)) w += glyph(ch, bold)[1];
  return (w * size) / 1000;
}
// Text as PDF string bytes, with ( ) \ escaped.
function pdfString(s, bold) {
  let out = "";
  for (const ch of String(s)) {
    const b = glyph(ch, bold)[0], c = String.fromCharCode(b);
    out += c === "(" || c === ")" || c === "\\" ? "\\" + c : c;
  }
  return "(" + out + ")";
}
// Break text into lines no wider than maxW.
export function wrap(s, size, maxW, bold = false) {
  const lines = [];
  String(s).split("\n").forEach((para) => {
    let line = "";
    para.split(/\s+/).filter(Boolean).forEach((word) => {
      const next = line ? line + " " + word : word;
      if (!line || textWidth(next, size, bold) <= maxW) { line = next; return; }
      lines.push(line); line = word;
    });
    lines.push(line);
  });
  return lines;
}

const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((x) => num(x / 255)).join(" "); };

export function createPdf() {
  const pages = [];
  let ops = null;
  const Y = (y) => PAGE_H - y;
  const doc = {
    page() { ops = []; pages.push(ops); return doc; },
    get pageCount() { return pages.length; },
    goto(i) { ops = pages[i]; return doc; },          // draw on an earlier page (page numbers go on last)
    // y is the text's baseline. align: "left" | "right" | "center" (x is that edge or the middle).
    text(x, y, s, { size = 11, bold = false, color = "#1d1e22", align = "left" } = {}) {
      const w = textWidth(s, size, bold), x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      ops.push(`BT /${bold ? "F2" : "F1"} ${num(size)} Tf ${rgb(color)} rg ${num(x0)} ${num(Y(y))} Td ${pdfString(s, bold)} Tj ET`);
      return w;
    },
    line(x1, y1, x2, y2, { color = "#d3d1c7", width = 0.75, dash = null } = {}) {
      ops.push(`q ${rgb(color)} RG ${num(width)} w ${dash ? `[${dash.join(" ")}] 0 d ` : ""}${num(x1)} ${num(Y(y1))} m ${num(x2)} ${num(Y(y2))} l S Q`);
    },
    polyline(pts, { color = "#b4b2a9", width = 1 } = {}) {
      if (pts.length < 2) return;
      ops.push(`q ${rgb(color)} RG ${num(width)} w 1 j ${pts.map((p, i) => `${num(p[0])} ${num(Y(p[1]))} ${i ? "l" : "m"}`).join(" ")} S Q`);
    },
    // A filled rectangle, with optionally rounded corners (r) and an outline instead of a fill (stroke).
    rect(x, y, w, h, { fill = null, stroke = null, width = 0.75, r = 0 } = {}) {
      const k = 0.5523 * r, x2 = x + w, y2 = y + h;
      const path = !r ? `${num(x)} ${num(Y(y2))} ${num(w)} ${num(h)} re` : [
        `${num(x + r)} ${num(Y(y))} m`, `${num(x2 - r)} ${num(Y(y))} l`,
        `${num(x2 - r + k)} ${num(Y(y))} ${num(x2)} ${num(Y(y + r - k))} ${num(x2)} ${num(Y(y + r))} c`, `${num(x2)} ${num(Y(y2 - r))} l`,
        `${num(x2)} ${num(Y(y2 - r + k))} ${num(x2 - r + k)} ${num(Y(y2))} ${num(x2 - r)} ${num(Y(y2))} c`, `${num(x + r)} ${num(Y(y2))} l`,
        `${num(x + r - k)} ${num(Y(y2))} ${num(x)} ${num(Y(y2 - r + k))} ${num(x)} ${num(Y(y2 - r))} c`, `${num(x)} ${num(Y(y + r))} l`,
        `${num(x)} ${num(Y(y + r - k))} ${num(x + r - k)} ${num(Y(y))} ${num(x + r)} ${num(Y(y))} c`, "h"].join(" ");
      const paint = fill && stroke ? "B" : fill ? "f" : "S";
      ops.push(`q ${fill ? rgb(fill) + " rg " : ""}${stroke ? rgb(stroke) + " RG " + num(width) + " w " : ""}${path} ${paint} Q`);
    },
    circle(cx, cy, r, { fill = "#1d1e22", stroke = null, width = 1 } = {}) {
      const k = 0.5523 * r, X = cx, C = Y(cy);
      const path = `${num(X + r)} ${num(C)} m ${num(X + r)} ${num(C + k)} ${num(X + k)} ${num(C + r)} ${num(X)} ${num(C + r)} c ` +
        `${num(X - k)} ${num(C + r)} ${num(X - r)} ${num(C + k)} ${num(X - r)} ${num(C)} c ${num(X - r)} ${num(C - k)} ${num(X - k)} ${num(C - r)} ${num(X)} ${num(C - r)} c ` +
        `${num(X + k)} ${num(C - r)} ${num(X + r)} ${num(C - k)} ${num(X + r)} ${num(C)} c h`;
      ops.push(`q ${rgb(fill)} rg ${stroke ? rgb(stroke) + " RG " + num(width) + " w " : ""}${path} ${stroke ? "B" : "f"} Q`);
    },
    // The finished file as bytes.
    bytes(title = "Daydeck summary") {
      const objs = [];
      const add = (s) => { objs.push(s); return objs.length; };
      const catalog = add(""), pagesObj = add("");
      const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      const kids = pages.map((p) => {
        const body = p.join("\n");
        const content = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
        return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`);
      });
      objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
      objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;
      const info = add(`<< /Title ${pdfString(title)} /Producer (Daydeck) >>`);
      let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
      const offsets = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
      out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
      return bytes;
    },
  };
  return doc;
}
