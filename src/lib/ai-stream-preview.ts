type StreamPreviewFeature = "clarify" | "plan" | "review";

function decodeEscape(source: string, index: number) {
  const char = source[index];
  switch (char) {
    case '"':
      return { value: '"', length: 1 };
    case "\\":
      return { value: "\\", length: 1 };
    case "/":
      return { value: "/", length: 1 };
    case "b":
      return { value: "\b", length: 1 };
    case "f":
      return { value: "\f", length: 1 };
    case "n":
      return { value: "\n", length: 1 };
    case "r":
      return { value: "\r", length: 1 };
    case "t":
      return { value: "\t", length: 1 };
    case "u": {
      const hex = source.slice(index + 1, index + 5);
      if (hex.length < 4 || !/^[0-9a-f]{4}$/i.test(hex)) {
        return { value: "", length: hex.length + 1 };
      }
      return {
        value: String.fromCharCode(Number.parseInt(hex, 16)),
        length: 5,
      };
    }
    default:
      return { value: char ?? "", length: char ? 1 : 0 };
  }
}

function readJsonString(source: string, quoteIndex: number) {
  let value = "";
  let index = quoteIndex + 1;

  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      return { value, complete: true, end: index + 1 };
    }
    if (char === "\\") {
      const next = decodeEscape(source, index + 1);
      value += next.value;
      index += next.length + 1;
      continue;
    }
    value += char;
    index += 1;
  }

  return { value, complete: false, end: source.length };
}

function findStringValues(source: string, key: string) {
  const matcher = new RegExp(`"${key}"\\s*:\\s*"`, "g");
  const values: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source))) {
    const quoteIndex = match.index + match[0].lastIndexOf('"');
    const result = readJsonString(source, quoteIndex);
    if (result.value.trim()) values.push(result.value.trim());
  }

  return values;
}

function findStringArrays(source: string, key: string) {
  const matcher = new RegExp(`"${key}"\\s*:\\s*\\[`, "g");
  const groups: string[][] = [];
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(source))) {
    const values: string[] = [];
    let index = match.index + match[0].length;

    while (index < source.length) {
      while (index < source.length && /[\s,]/.test(source[index])) index += 1;
      if (index >= source.length || source[index] === "]") break;
      if (source[index] !== '"') break;

      const result = readJsonString(source, index);
      if (result.value.trim()) values.push(result.value.trim());
      if (!result.complete) break;
      index = result.end;
    }

    groups.push(values);
  }

  return groups;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clarificationPreview(source: string) {
  const questions = unique(findStringValues(source, "question"));
  const optionGroups = findStringArrays(source, "options");
  const lines = questions.map((question, index) => {
    const options = optionGroups[index] ?? [];
    return options.length
      ? `${question}\n${options.join(" · ")}`
      : question;
  });

  if (!lines.length) {
    const placeholder = findStringValues(source, "supplementPlaceholder").at(-1);
    return placeholder ?? "";
  }

  return lines.slice(0, 4).join("\n\n");
}

function planPreview(source: string) {
  const shortTitles = unique(findStringValues(source, "shortTitle"));
  const titles = unique(findStringValues(source, "title"));
  const reasons = findStringValues(source, "reason");
  const taskLines = shortTitles.length ? shortTitles : titles;
  const lines = taskLines
    .slice(0, 5)
    .map((title) => `· ${title}`);
  const reason = reasons.at(-1);

  if (reason) lines.push("", reason);
  return lines.join("\n").trim();
}

function reviewPreview(source: string) {
  const summary = findStringValues(source, "summary").at(-1) ?? "";
  const nextActions = findStringValues(source, "nextActions").at(-1) ?? "";
  const nextLabel = nextActions ? `下一步\n${nextActions}` : "";
  return [summary, nextLabel].filter(Boolean).join("\n\n").trim();
}

export function buildAiStreamPreview(
  source: string,
  feature: StreamPreviewFeature,
) {
  if (feature === "clarify") return clarificationPreview(source);
  if (feature === "plan") return planPreview(source);
  return reviewPreview(source);
}
