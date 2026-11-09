import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const hooks = vi.hoisted(() => ({
  mounted: [] as (() => Promise<void>)[],
  unmounted: [] as (() => void)[],
}));
vi.mock("vue", () => ({
  onMounted: (callback: () => Promise<void>) => hooks.mounted.push(callback),
  onBeforeUnmount: (callback: () => void) => hooks.unmounted.push(callback),
  nextTick: () => Promise.resolve(),
}));
let documentMock: any;
let listeners: Set<(event: any) => void>;
function element() {
  const node: any = { isConnected: true, closest: vi.fn(() => null) };
  node.focus = vi.fn(() => {
    documentMock.activeElement = node;
  });
  return node;
}
function panel() {
  const attributes = new Map<string, string>();
  const backdrop = {
    inert: false,
    style: { visibility: "" },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  };
  const close = element(),
    topic = element();
  const node: any = {
    closest: () => backdrop,
    querySelector: (selector: string) => (selector === "input" ? null : close),
    querySelectorAll: () => [close, topic],
  };
  return { ref: { value: node }, backdrop, attributes, close, topic };
}
function escape() {
  let stopped = false;
  const event = {
    key: "Escape",
    preventDefault: vi.fn(),
    stopImmediatePropagation: () => {
      stopped = true;
    },
  };
  for (const listener of [...listeners]) {
    listener(event);
    if (stopped) break;
  }
}
beforeEach(() => {
  vi.resetModules();
  hooks.mounted.length = 0;
  hooks.unmounted.length = 0;
  listeners = new Set();
  documentMock = {
    body: { style: { overflow: "auto" } },
    activeElement: element(),
    addEventListener: (_name: string, handler: (event: any) => void) =>
      listeners.add(handler),
    removeEventListener: (_name: string, handler: (event: any) => void) =>
      listeners.delete(handler),
  };
  vi.stubGlobal("document", documentMock);
});
afterEach(() => vi.unstubAllGlobals());
describe("Day agenda → topic → day agenda", () => {
  it("closes only the topic on Escape and returns to the existing agenda without unlocking the page", async () => {
    const { useDialog } = await import("../../front/src/composables/dialog");
    const agenda = panel();
    const closeAgenda = vi.fn(() => hooks.unmounted[0]());
    useDialog(agenda.ref, closeAgenda);
    await hooks.mounted[0]();
    documentMock.activeElement = agenda.topic;
    const topic = panel();
    const closeTopic = vi.fn(() => hooks.unmounted[1]());
    useDialog(topic.ref, closeTopic);
    await hooks.mounted[1]();
    expect(agenda.backdrop.inert).toBe(true);
    expect(agenda.backdrop.style.visibility).toBe("hidden");
    expect(agenda.attributes.get("aria-hidden")).toBe("true");
    escape();
    expect(closeTopic).toHaveBeenCalledOnce();
    expect(closeAgenda).not.toHaveBeenCalled();
    expect(agenda.backdrop.inert).toBe(false);
    expect(agenda.backdrop.style.visibility).toBe("");
    expect(agenda.attributes.has("aria-hidden")).toBe(false);
    expect(documentMock.body.style.overflow).toBe("hidden");
    expect(documentMock.activeElement).toBe(agenda.topic);
    expect(agenda.topic.focus).toHaveBeenCalledWith({ preventScroll: true });
    escape();
    expect(closeAgenda).toHaveBeenCalledOnce();
    expect(documentMock.body.style.overflow).toBe("auto");
    expect(listeners.size).toBe(0);
  });
  it("keeps the top dialog active if its underlying calendar unmounts", async () => {
    const { useDialog } = await import("../../front/src/composables/dialog");
    const agenda = panel(),
      topic = panel();
    useDialog(agenda.ref, vi.fn());
    await hooks.mounted[0]();
    useDialog(topic.ref, vi.fn());
    await hooks.mounted[1]();
    hooks.unmounted[0]();
    expect(documentMock.body.style.overflow).toBe("hidden");
    expect(topic.backdrop.inert).toBe(false);
    hooks.unmounted[1]();
    expect(documentMock.body.style.overflow).toBe("auto");
    expect(listeners.size).toBe(0);
  });
});
