import type { InboxPlanTrack } from "@/lib/ai";

export type ProjectTrackRole = "main" | "side";
export type ProjectTrackStatus = "active" | "paused" | "archived";

/** 一次探索最多保留几条线；再多用户顾不过来，也会让首页变成清单。 */
export const MAX_EXPLORE_TRACKS = 4;

/** 一个探索项目同时最多保留几条开放任务，避免多线变成一张任务清单。 */
export const MAX_EXPLORE_OPEN_TASKS = 3;



export function normalizeTrackRole(value: unknown): ProjectTrackRole {
  return value === "side" ? "side" : "main";
}


/**
 * 读模型给出的线路图：去重、限数、保证恰好一条主线。
 *
 * 线路不强制多条——只有一个方向时就是一条主线。但模型如果标了两条主线，
 * 这里只保留第一条，其余降为支线：主次必须有唯一答案，否则轮换无从谈起。
 */
export function readPlanTracks(value: unknown): InboxPlanTrack[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tracks: InboxPlanTrack[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const name =
      typeof raw.name === "string" ? raw.name.trim().slice(0, 30) : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const intent =
      typeof raw.intent === "string" && raw.intent.trim()
        ? raw.intent.trim().slice(0, 200)
        : name;
    tracks.push({ name, intent, role: normalizeTrackRole(raw.role) });
    if (tracks.length >= MAX_EXPLORE_TRACKS) break;
  }
  if (!tracks.length) return [];
  let seenMain = false;
  for (const track of tracks) {
    if (track.role !== "main") continue;
    if (seenMain) track.role = "side";
    seenMain = true;
  }
  if (!seenMain) tracks[0].role = "main";
  return tracks;
}
