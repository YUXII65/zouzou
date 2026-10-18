const { createStickyNote } = require("../../utils/api");
const { normalizeStickySteps } = require("../../utils/sticky");

const DEFAULT_MESSAGE = "这个任务我还没有头绪，请给我一个能直接开始的行动方案";
const WAITING_LABELS = [
  "正在看这项任务…",
  "正在找一个马上能做的动作…",
  "正在写成具体步骤…",
  "快写好了…"
];

function normalizeNotes(notes) {
  return (Array.isArray(notes) ? notes : []).slice(0, 10).map((note) => ({
    ...note,
    steps: normalizeStickySteps(note),
  }));
}

Component({
  properties: {
    taskId: { type: String, value: "" },
    title: { type: String, value: "" },
    notes: { type: String, value: "" },
    projectName: { type: String, value: "" },
    status: { type: String, value: "" },
    initialNotes: {
      type: Array,
      value: [],
      observer(value) {
        this.setData({ displayNotes: normalizeNotes(value) });
      }
    }
  },

  data: {
    displayNotes: [],
    message: "",
    loading: false,
    waitingText: WAITING_LABELS[0],
    showPrevious: false
  },

  lifetimes: {
    attached() {
      this.setData({ displayNotes: normalizeNotes(this.data.initialNotes) });
    },
    detached() {
      this.stopWaiting();
    }
  },

  methods: {
    startWaiting() {
      this.stopWaiting();
      let index = 0;
      this.setData({ waitingText: WAITING_LABELS[index] });
      this._waitingTimer = setInterval(() => {
        index = (index + 1) % WAITING_LABELS.length;
        this.setData({ waitingText: WAITING_LABELS[index] });
      }, 1400);
    },

    stopWaiting() {
      if (this._waitingTimer) {
        clearInterval(this._waitingTimer);
        this._waitingTimer = null;
      }
    },

    onMessageInput(event) {
      this.setData({ message: event.detail.value });
    },

    onSubmitSupplement() {
      const message = String(this.data.message || "").trim();
      if (!message || this.data.loading) return;
      this.generate(message);
    },

    onGenerate() {
      if (this.data.loading) return;
      this.generate(DEFAULT_MESSAGE);
    },

    onTogglePrevious() {
      this.setData({ showPrevious: !this.data.showPrevious });
    },

    generate(message) {
      if (!this.data.taskId || this.data.loading) return;
      this.setData({ loading: true });
      this.startWaiting();
      createStickyNote(this.data.taskId, message)
        .then((result) => {
          const note = result && result.note ? result.note : result;
          if (!note || !note.id) throw new Error("missing_sticky_note");
          const nextNotes = normalizeNotes([
            note,
            ...this.data.displayNotes.filter((item) => item.id !== note.id),
          ]);
          this.setData({
            displayNotes: nextNotes,
            message: "",
            showPrevious: false
          });
          this.triggerEvent("change", { notes: nextNotes });
        })
        .catch(() => {
          wx.showToast({ title: "便利贴没生成成功", icon: "none" });
        })
        .then(() => {
          this.stopWaiting();
          this.setData({ loading: false });
        });
    }
  }
});
