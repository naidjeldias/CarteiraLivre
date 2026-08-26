const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 80_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractPdf(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const result = await extractText(pdf, { mergePages: true });
  const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
  return (text || "").replace(/\s+\n/g, "\n").trim();
}

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function extractFromUrl(url: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const res = await fetchWithTimeout(url, 12_000, {
      cache: "no-store",
      headers: { "User-Agent": "CarteiraLivre/0.1 (local disclosure sync)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;

    let text = "";
    if (contentType.includes("pdf") || url.toLowerCase().includes(".pdf")) {
      text = await extractPdf(buf);
    } else if (contentType.includes("html") || contentType.includes("xml") || contentType.includes("text")) {
      text = stripHtml(buf.toString("utf8"));
    } else {
      try {
        text = await extractPdf(buf);
      } catch {
        text = stripHtml(buf.toString("utf8"));
      }
    }
    text = text.replace(/\u0000/g, "").trim();
    if (!text) return null;
    return text.slice(0, MAX_CHARS);
  } catch {
    return null;
  }
}
