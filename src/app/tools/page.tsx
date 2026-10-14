import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * v3.3：产品收敛成首页 / 文件 / 个人三页，工具匣不再单独成页。
 * 统计口径已并入个人页，导出数据仍可从命令面板（Ctrl+K）使用。
 */
export default function ToolsRedirect() {
  redirect("/files");
}
