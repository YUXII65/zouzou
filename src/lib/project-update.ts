import type { ProjectStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureCurrentProjectStage } from "@/lib/project-stage";
import { normalizeProjectMode } from "@/lib/work-mode";

/**
 * 项目编辑的唯一实现：网页表单和小程序项目接口都调它。
 *
 * 网页那份会调 ensureCurrentProjectStage（长期项目必须始终有当前阶段），
 * 小程序那份没有，改完项目后阶段可能对不上。
 */
const projectStatuses: ProjectStatus[] = [
  "active",
  "paused",
  "completed",
  "archived",
];

export function projectStatus(value: unknown): ProjectStatus {
  return typeof value === "string" &&
    projectStatuses.includes(value as ProjectStatus)
    ? (value as ProjectStatus)
    : "active";
}

export async function updateProjectData(input: {
  userId: string;
  projectId: string;
  name: string;
  objective: string;
  status?: string | null;
  mode?: string | null;
  currentMilestone?: string | null;
  notes?: string | null;
}): Promise<{ id: string } | null> {
  const name = input.name.trim();
  const objective = input.objective.trim();
  if (!name || !objective) return null;

  const existing = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true },
  });
  if (!existing) return null;

  const currentMilestone = input.currentMilestone?.trim() || null;
  const project = await prisma.project.update({
    where: { id: existing.id, userId: input.userId },
    data: {
      name,
      objective,
      status: projectStatus(input.status),
      ...(input.mode != null
        ? { mode: normalizeProjectMode(input.mode) }
        : {}),
      currentMilestone,
      notes: input.notes?.trim() || null,
    },
    select: { id: true, mode: true, objective: true },
  });

  await ensureCurrentProjectStage(prisma, {
    userId: input.userId,
    projectId: project.id,
    mode: project.mode,
    milestone: currentMilestone,
    objective: project.objective,
  });

  return { id: project.id };
}