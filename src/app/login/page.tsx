import Link from "next/link";
import { after } from "next/server";
import { ArrowLeft } from "lucide-react";
import { AuthCard } from "@/components/auth-card";
import { BrandMark } from "@/components/brand-mark";
import { HalftoneSpiral } from "@/components/halftone-spiral";
import { prisma } from "@/lib/prisma";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : "";
  const initialMode =
    typeof params.mode === "string" && params.mode === "register"
      ? "register"
      : undefined;

  // 用户输入账号密码期间预热 Neon，避免注册提交时才承担连接冷启动。
  after(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      // 预热失败不影响登录页；真实提交仍会走原有重试。
    }
  });

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-background">
      <HalftoneSpiral />

      <div className="relative z-10 flex min-h-full items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <BrandMark className="size-12" />
            </div>
            <h1 className="text-xl font-semibold text-ink">走走</h1>
            <p className="mt-2 text-sm leading-6 text-ink-secondary">
              让想法，走成下一步
            </p>
          </div>

          <AuthCard next={next} error={error} initialMode={initialMode} />

          <Link
            href="/landing"
            className="zouzou-secondary-button inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-accent transition-colors hover:bg-surface-hover"
          >
            <ArrowLeft className="size-4" />
            先看看走走是什么
          </Link>
        </div>
      </div>
    </div>
  );
}
