import { getMiniProgramUserByToken } from "@/lib/miniprogram-auth";
import { buildTodayView, withLegacyTodayFields } from "@/lib/today-view";

// 微信「数据预拉取 / 数据周期性更新」回调接口。
// 微信服务器会在小程序冷启动前带 appid / timestamp / token 来 GET 这个地址，
// token 来自小程序端 wx.setBackgroundFetchToken（我们传用户的会话 token）。
// 返回体必须是一段字符串（<=256KB），会被微信原样缓存，端上用
// wx.getBackgroundFetchData({ fetchType: "pre" | "periodic" }) 读出。
export const dynamic = "force-dynamic";

function jsonResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get("token") ?? "").trim();
  const user = token ? await getMiniProgramUserByToken(token) : null;

  if (!user) {
    // 没带可用 token（未登录 / token 过期）时返回一个很短的包，端上会忽略。
    return jsonResponse(JSON.stringify({ v: 1, ok: false }));
  }

  try {
    // 过渡期兼容：旧小程序包读旧字段名。
    const data = withLegacyTodayFields(
      await buildTodayView({ userId: user.id }),
    );
    return jsonResponse(JSON.stringify({ v: 1, ok: true, data }));
  } catch (error) {
    console.error("[miniprogram prefetch]", error);
    return jsonResponse(JSON.stringify({ v: 1, ok: false }));
  }
}