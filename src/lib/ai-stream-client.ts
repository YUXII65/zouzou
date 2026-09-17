type AiStreamEvent<T> =
  | { type: "preview"; text: string }
  | { type: "done"; result: T }
  | { type: "error"; message?: string };

export async function consumeAiStream<T>(
  response: Response,
  onPreview: (text: string) => void,
): Promise<T> {
  if (!response.ok) {
    let message = "请求失败，请稍后重试";
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // Keep the generic message when the response is not JSON.
    }
    throw new Error(message);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("浏览器没有收到流式响应");

  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | undefined;

  function handleLine(line: string) {
    const text = line.trim();
    if (!text) return;
    const event = JSON.parse(text) as AiStreamEvent<T>;
    if (event.type === "preview") {
      onPreview(event.text);
      return;
    }
    if (event.type === "done") {
      result = event.result;
      return;
    }
    throw new Error(event.message || "AI 没有完成这次请求");
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }

  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);
  if (result === undefined) throw new Error("AI 没有返回完整结果");
  return result;
}
