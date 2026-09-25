import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const outDir = resolve("docs/xiaohongshu-recruitment");
mkdirSync(outDir, { recursive: true });

const baseCss = `
  * { box-sizing: border-box; }
  html, body {
    width: 1080px;
    height: 1440px;
    margin: 0;
    overflow: hidden;
  }
  body {
    font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif;
    color: #182238;
    background:
      radial-gradient(circle at 12% 8%, rgba(255,255,255,0.98) 0 8%, transparent 31%),
      radial-gradient(circle at 92% 92%, rgba(15,174,200,0.16) 0 6%, transparent 32%),
      linear-gradient(160deg, #eaf3ff 0%, #f7fbff 50%, #eaf8fa 100%);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .slide {
    position: relative;
    width: 1080px;
    height: 1440px;
    padding: 72px 78px 66px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .slide::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image: radial-gradient(rgba(47,99,230,0.13) 1px, transparent 1px);
    background-size: 24px 24px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,0.5), transparent 52%);
  }
  .brand {
    position: relative;
    z-index: 2;
    display: inline-flex;
    align-items: center;
    gap: 14px;
    font-size: 24px;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
  .brand-mark {
    width: 54px;
    height: 54px;
    border-radius: 16px;
    background: linear-gradient(145deg, #2f63e6, #497af0);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16px 34px rgba(47,99,230,0.25);
  }
  .brand-mark svg { width: 32px; height: 32px; }
  .eyebrow {
    position: relative;
    z-index: 2;
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 10px;
    margin-top: 52px;
    padding: 12px 18px;
    border: 1px solid rgba(47,99,230,0.16);
    border-radius: 999px;
    background: rgba(255,255,255,0.66);
    color: #2f63e6;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 0.06em;
    box-shadow: 0 10px 30px rgba(52,92,160,0.08);
  }
  .eyebrow-dot {
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: #0faec8;
    box-shadow: 0 0 0 7px rgba(15,174,200,0.13);
  }
  h1, h2, h3, p { margin: 0; }
  .hero-title {
    position: relative;
    z-index: 2;
    margin-top: 48px;
    font-size: 104px;
    line-height: 1.12;
    letter-spacing: -0.035em;
    font-weight: 800;
  }
  .accent-text { color: #2f63e6; }
  .underline-swipe {
    position: relative;
    display: inline-block;
  }
  .underline-swipe::after {
    content: "";
    position: absolute;
    z-index: -1;
    left: -5px;
    right: -8px;
    bottom: 6px;
    height: 22px;
    border-radius: 999px;
    background: rgba(15,174,200,0.22);
    transform: rotate(-1.5deg);
  }
  .hero-sub {
    position: relative;
    z-index: 2;
    margin-top: 52px;
    max-width: 840px;
    color: #4d6d94;
    font-size: 38px;
    line-height: 1.46;
    font-weight: 500;
  }
  .hero-sub strong { color: #182238; }
  .note {
    position: relative;
    z-index: 2;
    margin-top: auto;
    padding: 28px 30px 28px 34px;
    border: 1px solid rgba(255,255,255,0.88);
    border-radius: 24px;
    background: rgba(255,255,255,0.62);
    box-shadow: 0 22px 60px rgba(52,92,160,0.12);
    backdrop-filter: blur(18px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 28px;
  }
  .note-main { font-size: 29px; line-height: 1.45; font-weight: 700; }
  .note-main span { color: #2f63e6; }
  .note-small { color: #7e93ae; font-size: 21px; line-height: 1.4; text-align: right; white-space: nowrap; }
  .path {
    position: absolute;
    z-index: 1;
    right: -38px;
    top: 420px;
    width: 490px;
    height: 650px;
    opacity: 0.9;
  }
  .section-label {
    position: relative;
    z-index: 2;
    margin-top: 58px;
    color: #2f63e6;
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .section-title {
    position: relative;
    z-index: 2;
    margin-top: 30px;
    font-size: 72px;
    line-height: 1.24;
    letter-spacing: -0.025em;
    font-weight: 800;
  }
  .section-title.compact { font-size: 64px; }
  .card-grid {
    position: relative;
    z-index: 2;
    margin-top: 58px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .card {
    min-height: 218px;
    padding: 30px 30px 28px;
    border: 1px solid rgba(255,255,255,0.92);
    border-radius: 26px;
    background: rgba(255,255,255,0.65);
    box-shadow: 0 18px 48px rgba(52,92,160,0.10);
    backdrop-filter: blur(16px);
  }
  .card:nth-child(2) { background: rgba(232,240,255,0.78); }
  .card:nth-child(3) { background: rgba(229,248,251,0.78); }
  .card:nth-child(4) { background: rgba(255,255,255,0.76); }
  .card-icon {
    width: 50px;
    height: 50px;
    border-radius: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #edf4ff;
    color: #2f63e6;
    font-size: 23px;
    font-weight: 800;
  }
  .card h3 { margin-top: 26px; font-size: 32px; line-height: 1.3; font-weight: 800; }
  .card p { margin-top: 12px; color: #607898; font-size: 22px; line-height: 1.5; }
  .bottom-line {
    position: relative;
    z-index: 2;
    margin-top: auto;
    padding-top: 34px;
    border-top: 1px solid rgba(47,99,230,0.15);
    color: #4d6d94;
    font-size: 28px;
    line-height: 1.45;
    font-weight: 600;
  }
  .steps {
    position: relative;
    z-index: 2;
    margin-top: 62px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .step {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 24px;
    align-items: center;
    padding: 28px 30px;
    border-radius: 26px;
    background: rgba(255,255,255,0.67);
    border: 1px solid rgba(255,255,255,0.94);
    box-shadow: 0 18px 48px rgba(52,92,160,0.09);
  }
  .step-num {
    width: 76px;
    height: 76px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2f63e6;
    color: white;
    font-size: 28px;
    font-weight: 800;
    box-shadow: 0 12px 28px rgba(47,99,230,0.22);
  }
  .step:nth-child(2) .step-num { background: #0faec8; box-shadow: 0 12px 28px rgba(15,174,200,0.22); }
  .step h3 { font-size: 34px; line-height: 1.25; font-weight: 800; }
  .step p { margin-top: 9px; color: #607898; font-size: 23px; line-height: 1.4; }
  .quote {
    position: relative;
    z-index: 2;
    margin-top: auto;
    padding: 34px 36px;
    border-left: 7px solid #0faec8;
    border-radius: 0 22px 22px 0;
    background: rgba(229,248,251,0.75);
    color: #29465f;
    font-size: 31px;
    line-height: 1.5;
    font-weight: 700;
  }
  .private {
    position: relative;
    z-index: 2;
    margin-top: 48px;
    padding: 42px 44px;
    border-radius: 30px;
    background: linear-gradient(145deg, #2f63e6, #3d75ec);
    color: white;
    box-shadow: 0 28px 70px rgba(47,99,230,0.24);
  }
  .private-label { font-size: 23px; font-weight: 700; opacity: 0.78; }
  .private h2 { margin-top: 18px; font-size: 56px; line-height: 1.25; letter-spacing: -0.02em; font-weight: 800; }
  .bubbles { margin-top: 34px; display: flex; flex-direction: column; gap: 16px; }
  .bubble {
    width: fit-content;
    padding: 20px 25px;
    border-radius: 18px 18px 18px 5px;
    background: rgba(255,255,255,0.16);
    border: 1px solid rgba(255,255,255,0.18);
    font-size: 29px;
    font-weight: 700;
  }
  .tags {
    position: relative;
    z-index: 2;
    margin-top: 34px;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }
  .tag {
    padding: 15px 20px;
    border-radius: 999px;
    background: rgba(255,255,255,0.72);
    border: 1px solid rgba(47,99,230,0.14);
    color: #355173;
    font-size: 23px;
    font-weight: 700;
  }
  .cta {
    position: relative;
    z-index: 2;
    margin-top: auto;
    text-align: center;
  }
  .cta-kicker { color: #2f63e6; font-size: 25px; font-weight: 800; letter-spacing: 0.08em; }
  .cta-title { margin-top: 14px; font-size: 54px; line-height: 1.25; font-weight: 800; }
  .cta-sub { margin-top: 16px; color: #607898; font-size: 25px; }
  .footer-brand { position: relative; z-index: 2; margin-top: 38px; color: #7e93ae; font-size: 20px; text-align: center; }
`;

const brandMark = `
  <div class="brand">
    <span class="brand-mark">
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M24 18 L42 32 L24 46" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span>走走</span>
  </div>
`;

const slides = [
  {
    file: "01-cover.html",
    png: "01-cover.png",
    body: `
      ${brandMark}
      <div class="eyebrow"><span class="eyebrow-dot"></span>招募 5 位真实用户</div>
      <svg class="path" viewBox="0 0 490 650" fill="none" aria-hidden="true">
        <path d="M35 592 C125 560, 78 430, 193 382 C309 334, 278 190, 425 64" stroke="#2F63E6" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 20" opacity="0.55"/>
        <circle cx="35" cy="592" r="17" fill="#0FAEC8" opacity="0.18"/>
        <circle cx="35" cy="592" r="7" fill="#0FAEC8"/>
        <circle cx="425" cy="64" r="23" fill="#2F63E6" opacity="0.13"/>
        <circle cx="425" cy="64" r="9" fill="#2F63E6"/>
      </svg>
      <h1 class="hero-title">想做却<br><span class="underline-swipe accent-text">一直没开始？</span></h1>
      <p class="hero-sub">找 5 个人，各带一件<strong>真实卡住的事</strong>来。<br>20 分钟，看看能不能拆出今天先做什么。</p>
      <div class="note">
        <div class="note-main">不用夸产品<br><span>只要说真实感受</span></div>
        <div class="note-small">私信报名<br>只找 5 人</div>
      </div>
    `,
  },
  {
    file: "02-pain.html",
    png: "02-pain.png",
    body: `
      ${brandMark}
      <div class="section-label">如果你最近也这样</div>
      <h2 class="section-title">不是没想法<br>是不知道<span class="accent-text">今天先做什么</span></h2>
      <div class="card-grid">
        <article class="card"><div class="card-icon">01</div><h3>项目停了很久</h3><p>知道该重启，但一想到全貌就不敢碰。</p></article>
        <article class="card"><div class="card-icon">02</div><h3>计划写了没执行</h3><p>清单越写越长，行动却没变。</p></article>
        <article class="card"><div class="card-icon">03</div><h3>想重启没入口</h3><p>不是不想做，是找不到第一下。</p></article>
        <article class="card"><div class="card-icon">04</div><h3>越拖越不敢碰</h3><p>拖得越久，越像搬不动的石头。</p></article>
      </div>
      <div class="bottom-line">我想听的，就是这件事真正卡住的地方。</div>
    `,
  },
  {
    file: "03-how.html",
    png: "03-how.png",
    body: `
      ${brandMark}
      <div class="section-label">这次试用，和普通问卷不一样</div>
      <h2 class="section-title compact">不要求好评<br>只想看你<span class="accent-text">卡在哪</span></h2>
      <div class="steps">
        <section class="step"><div class="step-num">01</div><div><h3>带一件真实的事</h3><p>最近想做、但一直没推进，越具体越好。</p></div></section>
        <section class="step"><div class="step-num">02</div><div><h3>20 分钟边用边说</h3><p>我不会教你怎么点，也不会打断你的判断。</p></div></section>
        <section class="step"><div class="step-num">03</div><div><h3>说出犹豫和别扭</h3><p>哪句话不像你的情况，哪个步骤让你想关掉。</p></div></section>
      </div>
      <div class="quote">我需要听到的是：<br>“我刚刚为什么会停在这里。”</div>
    `,
  },
  {
    file: "04-cta.html",
    png: "04-cta.png",
    body: `
      ${brandMark}
      <div class="section-label">只找 5 个人</div>
      <div class="private">
        <div class="private-label">想参加，私信我两句话</div>
        <h2>什么事<br>卡了多久</h2>
        <div class="bubbles">
          <div class="bubble">① 卡住的事是什么</div>
          <div class="bubble">② 大概卡了多久</div>
        </div>
      </div>
      <div class="tags">
        <span class="tag">最近一个月</span>
        <span class="tag">真实事项</span>
        <span class="tag">20 分钟</span>
        <span class="tag">不填问卷</span>
      </div>
      <div class="cta">
        <div class="cta-kicker">合适的话，我会直接约时间</div>
        <div class="cta-title">不合适也会直接说<br>不耽误你</div>
        <div class="cta-sub">不用准备截图，也不用先整理好</div>
      </div>
      <div class="footer-brand">走走 · 把模糊想法拆成今天能做的下一步</div>
    `,
  },
];

for (const slide of slides) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${slide.png}</title>
  <style>${baseCss}</style>
</head>
<body>
  <main class="slide">${slide.body}</main>
</body>
</html>`;
  writeFileSync(resolve(outDir, slide.file), html, "utf8");
}

const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
for (const slide of slides) {
  const htmlPath = resolve(outDir, slide.file).replaceAll("\\", "/");
  const pngPath = resolve(outDir, slide.png).replaceAll("\\", "/");
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-sandbox",
    "--force-device-scale-factor=1",
    "--window-size=1080,1440",
    `--screenshot=${pngPath}`,
    `file:///${htmlPath}`,
  ], { stdio: "inherit" });
}

console.log(`Generated ${slides.length} images in ${outDir}`);


