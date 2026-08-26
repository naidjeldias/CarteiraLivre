import type { ReactNode } from "react";

function formatInline(text: string, keyPrefix: string): ReactNode[] {
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const tok = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={key}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("*")) nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else if (tok.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
      if (link) {
        const [, label, href] = link;
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noreferrer" className="assistant-md-link">
            {label}
          </a>
        );
      } else {
        nodes.push(tok);
      }
    } else nodes.push(tok);
    last = match.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isTableSep(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function renderTable(lines: string[], key: string): ReactNode {
  const rows = lines.filter((l) => !isTableSep(l)).map(splitRow);
  if (!rows.length) return null;
  const [head, ...body] = rows;
  return (
    <table key={key} className="assistant-md-table">
      <thead>
        <tr>
          {head.map((cell, i) => (
            <th key={i}>{formatInline(cell, `${key}-h${i}`)}</th>
          ))}
        </tr>
      </thead>
      {body.length > 0 && (
        <tbody>
          {body.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>{formatInline(cell, `${key}-r${r}c${c}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      )}
    </table>
  );
}

export function AssistantMessageBody({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (!para.length) return;
    const content = para.join(" ").trim();
    if (content) {
      blocks.push(<p key={`p-${blocks.length}`}>{formatInline(content, `p${blocks.length}`)}</p>);
    }
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      flushPara();
      i += 1;
      continue;
    }

    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const tableLines = [line];
      i += 1;
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i += 1;
      }
      blocks.push(renderTable(tableLines, `t-${blocks.length}`));
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      const Tag = level === 1 ? "h3" : "h4";
      blocks.push(
        <Tag key={`h-${blocks.length}`}>{formatInline(heading[2], `h${blocks.length}`)}</Tag>
      );
      i += 1;
      continue;
    }

    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const item = /^\s*[-*]\s+(.+)$/.exec(lines[i]);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`}>
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item, `li${blocks.length}-${idx}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const numbered = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      flushPara();
      const items: string[] = [];
      while (i < lines.length) {
        const item = /^\s*\d+\.\s+(.+)$/.exec(lines[i]);
        if (!item) break;
        items.push(item[1]);
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`}>
          {items.map((item, idx) => (
            <li key={idx}>{formatInline(item, `ol${blocks.length}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    para.push(line.trim());
    i += 1;
  }
  flushPara();

  return <div className="assistant-md">{blocks}</div>;
}
