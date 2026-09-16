"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Focus,
  ListTodo,
  NotebookPen,
  Sparkles,
  Target,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { LandingDemo } from "./landing-demo";

const outcomes = [
  {
    icon: Sparkles,
    title: "不用内耗复杂的思绪",
    body: "倒出想法，AI 自动归类到项目，生成可执行任务。",
  },
  {
    icon: Focus,
    title: "不用纠结今天做什么",
    body: "每天打开，先看到今天最该推进的 1-3 件事。",
  },
  {
    icon: NotebookPen,
    title: "不用害怕半途而废",
    body: "每晚轻量复盘，AI 自动生成明天计划，形成持续闭环。",
  },
];

const comparisons = [
  {
    name: "ChatGPT",
    gap: "会帮你整理，但不会持续记住你的目标和复盘。",
  },
  {
    name: "Todoist",
    gap: "帮你管理任务，但不知道你为什么做。",
  },
  {
    name: "Notion",
    gap: "给你一堆模板，但不知道哪个适合你。",
  },
  {
    name: "WorkBuddy",
    gap: "替你执行任务，但不会帮你决定该做什么。",
  },
  {
    name: "走走",
    gap: "帮你把想法变成可持续推进的个人项目。",
  },
];

const audiences = [
  "学习者：备考、学英语、学技能，一直开始不了。",
  "创作者：自媒体、写作、作品集，想法多但输出少。",
  "自由职业者：项目杂、优先级乱，需要每天聚焦。",
  "知识工作者：会议和琐事多，需要把重要目标拉回日常。",
];

export function LandingPage({ authed = false }: { authed?: boolean }) {
  return (
    <div
      data-release="guided-onboarding-2026-09-12-r6"
      className="fixed inset-0 z-40 overflow-y-auto"
    >
      <div className="mx-auto min-h-dvh w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header
          className={`mb-12 flex items-center gap-4 ${
            authed ? "justify-between" : ""
          }`}
        >
          <div className="flex items-center gap-2">
            <BrandMark className="size-8" />
            <span className="text-sm font-semibold text-ink">走走</span>
          </div>
          {authed ? (
            <Link
              href="/"
              className="zouzou-secondary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink-secondary transition-colors hover:border-accent hover:text-accent"
            >
              返回走走
            </Link>
          ) : null}
        </header>

        <section className="mb-12">
          <p className="mb-3 text-sm font-medium text-accent">
            让想法，走成下一步
          </p>
          <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-ink sm:text-4xl">
            把脑子里的一堆<span className="text-accent">想法</span>，
            <br />
            变成今天能做的 1-3 件事。
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-ink-secondary">
            不用自学 AI 工作流，也不用自己拆任务，走走陪你一起让想法落地。
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="zouzou-primary-button inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              注册/登录
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

        <section className="mb-12 grid gap-4 sm:grid-cols-3">
          {outcomes.map((outcome) => {
            const Icon = outcome.icon;
            return (
              <div
                key={outcome.title}
                className="zouzou-panel rounded-xl p-5"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                  <Icon className="size-4" />
                </span>
                <p className="mt-3 text-sm font-semibold text-ink">
                  {outcome.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-ink-secondary">
                  {outcome.body}
                </p>
              </div>
            );
          })}
        </section>

        <section className="zouzou-panel mb-12 rounded-xl p-5 sm:p-8">
          <h2 className="text-2xl font-semibold text-ink">
            看看它怎么把你的一堆想法，走成今天的下一步。
          </h2>
          <LandingDemo />
        </section>

        <section className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="zouzou-panel rounded-xl p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink">为什么选择我们</h2>
            <div className="mt-4 space-y-3">
              {comparisons.map((item) => (
                <div
                  key={item.name}
                  className="flex items-start gap-3 rounded-lg bg-surface-muted p-3"
                >
                  <span className="mt-1 shrink-0">
                      {item.name === "走走" ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <Target className="size-4 text-ink-muted" />
                    )}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-ink">{item.name}</p>
                    <p className="mt-0.5 text-sm leading-6 text-ink-secondary">
                      {item.gap}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="zouzou-panel rounded-xl p-5 sm:p-6">
            <h2 className="text-lg font-semibold text-ink">适合谁</h2>
            <div className="mt-4 space-y-3">
              {audiences.map((audience) => (
                <p
                  key={audience}
                  className="flex items-start gap-2 text-sm leading-6 text-ink-secondary"
                >
                  <ListTodo className="mt-0.5 size-4 shrink-0 text-accent" />
                  {audience}
                </p>
              ))}
            </div>
            <div className="mt-5 rounded-lg bg-accent-soft p-3 text-xs leading-5 text-accent-strong">
              如果你已经有一套稳定的 GTD 流程，或者只想要 AI
              替你干活，走走暂时不适合你。
            </div>
          </div>
        </section>

        <section className="zouzou-panel rounded-xl border-border-strong/60 bg-surface p-6 text-center sm:p-10">
          <h2 className="text-2xl font-semibold text-ink">
            现在从一句真实想法开始。
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-secondary">
            不用整理，不用选模板，先把你脑子里转的东西说出来。
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="zouzou-primary-button inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              注册/登录
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
