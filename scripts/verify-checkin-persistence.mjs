/**
 * 验证打卡文件夹和首批条目能在同一次原子写入里落库。
 * 运行前需要本地 PostgreSQL / PGlite：
 *   pnpm verify:checkin-persistence
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  CHECKIN_MODE,
  createCheckinProject,
  toggleCheckinItem,
  updateCheckinItems,
} from "@/lib/checkin";

const databaseUrl = new URL(process.env.DATABASE_URL || "");
if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) {
  throw new Error("verify:checkin-persistence 只允许连接本地数据库");
}

const user = await prisma.user.create({
  data: {
    username: `checkin_persistence_${Date.now()}`,
    passwordHash: "x",
  },
  select: { id: true },
});

try {
  const items = ["读Drift文章", "远眺", "练字", "阅读"];
  const first = await createCheckinProject({ userId: user.id, items });
  assert.equal(first.ok, true);
  if (!first.ok) throw new Error(first.error);
  assert.equal(first.added, items.length);

  const second = await createCheckinProject({ userId: user.id, items });
  assert.deepEqual(second, {
    ok: true,
    projectId: first.projectId,
    added: 0,
  });

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: first.projectId },
    select: {
      mode: true,
      checkinOwnerId: true,
      tasks: {
        orderBy: { planOrder: "asc" },
        select: {
          id: true,
          title: true,
          planOrder: true,
          executionMode: true,
          doneWhen: true,
          methodHint: true,
        },
      },
    },
  });

  assert.equal(project.mode, CHECKIN_MODE);
  assert.equal(project.checkinOwnerId, user.id);
  assert.deepEqual(
    project.tasks.map((task) => task.title),
    items,
  );
  assert.deepEqual(
    project.tasks.map((task) => task.planOrder),
    [0, 1, 2, 3],
  );
  assert.ok(project.tasks.every((task) => task.executionMode === "quick"));
  assert.ok(project.tasks.every((task) => Boolean(task.doneWhen)));
  assert.ok(project.tasks.every((task) => Boolean(task.methodHint)));

  const renamedId = project.tasks[0].id;
  const keptId = project.tasks[2].id;
  const toggledOn = await toggleCheckinItem({
    userId: user.id,
    taskId: renamedId,
  });
  assert.equal(toggledOn.ok, true);
  assert.equal(toggledOn.completed, true);
  const toggledOff = await toggleCheckinItem({
    userId: user.id,
    taskId: renamedId,
  });
  assert.equal(toggledOff.ok, true);
  assert.equal(toggledOff.completed, false);

  await prisma.taskCheckinCompletion.create({
    data: {
      userId: user.id,
      taskId: renamedId,
      checkinDate: "2026-10-27",
    },
  });

  const edit = await updateCheckinItems({
    userId: user.id,
    projectId: first.projectId,
    items: [
      { id: renamedId, title: "读Drift文章并记一句" },
      { id: keptId, title: "练字" },
      { title: "拉伸" },
    ],
  });
  assert.deepEqual(edit, {
    ok: true,
    projectId: first.projectId,
    added: 1,
  });

  const editedProject = await prisma.project.findUniqueOrThrow({
    where: { id: first.projectId },
    select: {
      tasks: {
        orderBy: { planOrder: "asc" },
        select: {
          id: true,
          title: true,
          checkinCompletions: { select: { checkinDate: true } },
        },
      },
    },
  });
  assert.deepEqual(
    editedProject.tasks.map((task) => task.title),
    ["读Drift文章并记一句", "练字", "拉伸"],
  );
  assert.deepEqual(
    editedProject.tasks[0].checkinCompletions.map((item) => item.checkinDate),
    ["2026-10-27"],
  );

  console.log("PASS checkin-persistence");
} finally {
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  await prisma.$disconnect();
}
