/**
 * 从模型输出里提取第一个完整的 JSON 对象。
 *
 * 不要用「第一个 { 到最后一个 }」：模型偶尔会在 JSON 后面再补一句解释，
 * 那句话里带花括号，切出来的字符串就不是合法 JSON，整条结果会掉进兜底，
 * 用户看到的是降级输出而不是模型真正给的内容。
 *
 * 这里按括号配对找第一个平衡的 {...}，并跳过字符串字面量里的括号与转义。
 */
export function extractJsonObject(text: string | null | undefined): string | null {
  const source = String(text ?? "");
  const start = source.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  return null;
}
