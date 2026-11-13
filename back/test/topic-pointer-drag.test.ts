import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startTopicPointerDrag } from "../../front/src/composables/topicPointerDrag";

let listeners: Map<string, Set<(event: any) => void>>;
let frames: Map<number, FrameRequestCallback>;
let classes: Set<string>;
let handle: any, source: any, preview: any, target: any;
let callbacks: any;
const bounds = {
  left: 0,
  top: 0,
  right: 200,
  bottom: 100,
  width: 200,
  height: 100,
};
function node() {
  return {
    style: { setProperty: vi.fn() },
    classList: { add: vi.fn() },
    querySelectorAll: () => [],
    getBoundingClientRect: () => bounds,
    removeAttribute: vi.fn(),
    setAttribute: vi.fn(),
    remove: vi.fn(),
  };
}
function emit(type: string, extra: Record<string, unknown> = {}) {
  const event = {
    type,
    pointerId: 1,
    clientX: 190,
    clientY: 40,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
    ...extra,
  };
  for (const listener of [...(listeners.get(type) || [])]) listener(event);
  return event;
}
function start() {
  return startTopicPointerDrag(
    {
      isPrimary: true,
      button: 0,
      pointerId: 1,
      clientX: 190,
      clientY: 40,
      currentTarget: handle,
    } as unknown as PointerEvent,
    source,
    callbacks,
  )!;
}
beforeEach(() => {
  listeners = new Map();
  frames = new Map();
  classes = new Set();
  handle = {
    setPointerCapture: vi.fn(),
    hasPointerCapture: () => true,
    releasePointerCapture: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  preview = node();
  source = { ...node(), cloneNode: () => preview };
  target = {
    closest: () => ({ dataset: { topicDropDate: "2026-12-03" } }),
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }),
    parentElement: null,
    scrollTop: 0,
    scrollLeft: 0,
  };
  callbacks = {
    start: vi.fn(() => true),
    hover: vi.fn(),
    drop: vi.fn(),
    cancel: vi.fn(),
    finish: vi.fn(),
  };
  vi.stubGlobal("document", {
    elementFromPoint: vi.fn(() => target),
    body: { append: vi.fn() },
    documentElement: {
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
    },
  });
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    addEventListener: (name: string, handler: any) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(handler);
    },
    removeEventListener: (name: string, handler: any) =>
      listeners.get(name)?.delete(handler),
  });
  vi.stubGlobal("getComputedStyle", () =>
    Object.assign([], {
      getPropertyValue: () => "",
      overflowX: "auto",
      overflowY: "auto",
    }),
  );
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => vi.unstubAllGlobals());

describe("Topic pointer dragging", () => {
  it("keeps a click as a click and ignores another pointer", () => {
    start();
    emit("pointermove", { pointerId: 2, clientX: 350 });
    emit("pointermove", { clientX: 192 });
    emit("pointerup");
    expect(callbacks.start).not.toHaveBeenCalled();
    expect(callbacks.drop).not.toHaveBeenCalled();
    expect(callbacks.finish).toHaveBeenCalledWith(false);
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
  it("holds the grabbing cursor throughout motion, then drops on the release date and removes the preview", () => {
    start();
    emit("pointermove", { clientX: 300 });
    expect(callbacks.start).toHaveBeenCalledOnce();
    expect(classes.has("topic-drag-active")).toBe(true);
    expect(preview.style.transform).toBe("translate3d(110px, 0px, 0)");
    emit("pointermove", { clientX: 350 });
    expect(classes.has("topic-drag-active")).toBe(true);
    target.closest = () => ({ dataset: { topicDropDate: "2026-12-04" } });
    emit("pointerup", { clientX: 400 });
    expect(callbacks.drop).toHaveBeenCalledWith("2026-12-04");
    expect(callbacks.cancel).not.toHaveBeenCalled();
    expect(callbacks.finish).toHaveBeenCalledWith(true);
    expect(classes.size).toBe(0);
    expect(frames.size).toBe(0);
    expect(preview.remove).toHaveBeenCalledOnce();
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });
  it.each(["Escape", "blur", "pointercancel", "unmount"])(
    "cancels on %s without saving a date",
    (reason) => {
      const cancel = start();
      emit("pointermove", { clientX: 300 });
      if (reason === "Escape") {
        const key = emit("keydown", { key: "Escape" });
        expect(key.stopImmediatePropagation).toHaveBeenCalled();
      } else if (reason === "unmount") cancel();
      else emit(reason);
      emit("pointerup");
      expect(callbacks.cancel).toHaveBeenCalledOnce();
      expect(callbacks.drop).not.toHaveBeenCalled();
      expect(classes.size).toBe(0);
      expect(frames.size).toBe(0);
      expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    },
  );
  it("clears the hovered date when released outside any day", () => {
    start();
    emit("pointermove", { clientX: 300 });
    vi.mocked(document.elementFromPoint).mockReturnValue(null);
    emit("pointerup");
    expect(callbacks.drop).toHaveBeenCalledWith("");
    expect(classes.size).toBe(0);
  });
  it("scrolls the container near its edge and refreshes the hovered date without a pointer move", () => {
    start();
    emit("pointermove", { clientX: 300, clientY: 590 });
    expect(target.scrollTop).toBeGreaterThan(0);
    const before = target.scrollTop;
    target.closest = () => ({ dataset: { topicDropDate: "2026-12-05" } });
    const [id, frame] = [...frames][0];
    frames.delete(id);
    frame(performance.now() + 17);
    expect(target.scrollTop).toBeGreaterThan(before);
    expect(callbacks.hover).toHaveBeenLastCalledWith("2026-12-05");
    emit("pointerup");
  });
});
