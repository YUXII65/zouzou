type JsonEvent = Record<string, unknown> & { type: string };

export function createNdjsonResponse(
  run: (send: (event: JsonEvent) => void) => Promise<void>,
) {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: JsonEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        await run(send);
      } catch (error) {
        console.error("[ai-stream] request failed", error);
        send({ type: "error", message: "AI 请求失败，请稍后重试" });
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Encoding": "identity",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
