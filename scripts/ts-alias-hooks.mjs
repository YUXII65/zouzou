/**
 * 让 Node 原生测试跑得动 src/ 里的 TypeScript：
 * 把 tsconfig 里的 "@/*" 映射到 "src/*"，并补上省略的扩展名。
 *
 * 这样测试不需要 vitest / tsx 之类的新依赖，直接用 Node 24 自带的类型擦除。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const CANDIDATE_SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(srcRoot, specifier.slice(2));
    for (const suffix of CANDIDATE_SUFFIXES) {
      const candidate = base + suffix;
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
