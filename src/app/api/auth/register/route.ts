import { handleWebAuth } from "@/lib/web-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handleWebAuth(request, "register");
}
