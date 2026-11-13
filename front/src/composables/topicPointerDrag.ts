type DragCallbacks = {
  start: () => boolean;
  hover: (date: string) => void;
  drop: (date: string) => void;
  cancel: () => void;
  finish: (moved: boolean) => void;
};

// Snapshot the appearance before the source is dimmed. The preview lives outside
// the calendar's clipping/scrolling containers, so copy its contextual styles.
function previewCard(source: HTMLElement) {
  const preview = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...source.querySelectorAll<HTMLElement>("*")];
  const copies = [preview, ...preview.querySelectorAll<HTMLElement>("*")];
  originals.forEach((node, index) => {
    const style = getComputedStyle(node);
    for (const property of style) {
      copies[index].style.setProperty(
        property,
        style.getPropertyValue(property),
      );
    }
    copies[index].removeAttribute("id");
  });
  const bounds = source.getBoundingClientRect();
  Object.assign(preview.style, {
    position: "fixed",
    inset: "auto",
    top: "0",
    left: "0",
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    margin: "0",
    boxSizing: "border-box",
    zIndex: "10000",
    transition: "none",
    opacity: "0.95",
    boxShadow: "0 12px 30px #0003",
  });
  preview.classList.add("topic-drag-preview");
  preview.setAttribute("aria-hidden", "true");
  preview.inert = true;
  document.body.append(preview);
  return preview;
}

function edgeSpeed(position: number, start: number, end: number) {
  const edge = Math.min(48, (end - start) / 3);
  if (position < start || position > end) return 0;
  if (position < start + edge) return -18 * (1 - (position - start) / edge);
  if (position > end - edge) return 18 * (1 - (end - position) / edge);
  return 0;
}

// Scroll the innermost available container first, then its ancestors/the page.
function autoScroll(
  target: Element | null,
  x: number,
  y: number,
  elapsed: number,
) {
  let movedX = false,
    movedY = false;
  for (let node = target; node; node = node.parentElement) {
    const root = node === document.scrollingElement;
    const style = getComputedStyle(node);
    const bounds = root
      ? {
          left: 0,
          top: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
        }
      : node.getBoundingClientRect();
    if (
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom
    )
      continue;
    for (const axis of ["x", "y"] as const) {
      if (axis === "x" ? movedX : movedY) continue;
      const overflow = axis === "x" ? style.overflowX : style.overflowY;
      if (!root && !/^(auto|scroll)$/.test(overflow)) continue;
      const delta =
        axis === "x"
          ? edgeSpeed(x, bounds.left, bounds.right)
          : edgeSpeed(y, bounds.top, bounds.bottom);
      const property = axis === "x" ? "scrollLeft" : "scrollTop";
      const before = node[property];
      node[property] += (delta * elapsed) / 16.67;
      if (node[property] !== before) {
        if (axis === "x") movedX = true;
        else movedY = true;
      }
    }
  }
}

export function startTopicPointerDrag(
  event: PointerEvent,
  source: HTMLElement,
  callbacks: DragCallbacks,
): (() => void) | undefined {
  if (!event.isPrimary || event.button !== 0) return;
  const handle = event.currentTarget as HTMLElement;
  const bounds = source.getBoundingClientRect();
  const pointerId = event.pointerId;
  const offsetX = event.clientX - bounds.left,
    offsetY = event.clientY - bounds.top;
  let x = event.clientX,
    y = event.clientY;
  let active = false,
    closed = false;
  let preview: HTMLElement | undefined;
  let frame = 0,
    previousTime = 0;

  function dateAtPointer() {
    return (
      document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-topic-drop-date]")?.dataset
        .topicDropDate || ""
    );
  }
  function paint(time: number) {
    if (!active || closed) return;
    autoScroll(
      document.elementFromPoint(x, y),
      x,
      y,
      previousTime ? Math.min(32, time - previousTime) : 16.67,
    );
    previousTime = time;
    preview!.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0)`;
    callbacks.hover(dateAtPointer());
    frame = requestAnimationFrame(paint);
  }
  function finish(drop = false) {
    if (closed) return;
    closed = true;
    const date = drop && active ? dateAtPointer() : "";
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("blur", cancel);
    handle.removeEventListener("lostpointercapture", cancel);
    if (handle.hasPointerCapture(pointerId))
      handle.releasePointerCapture(pointerId);
    preview?.remove();
    document.documentElement.classList.remove("topic-drag-active");
    callbacks.finish(active);
    if (active) {
      if (drop) callbacks.drop(date);
      else callbacks.cancel();
    }
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    x = next.clientX;
    y = next.clientY;
    if (!active && Math.hypot(x - event.clientX, y - event.clientY) >= 5) {
      preview = previewCard(source);
      if (!callbacks.start()) {
        finish();
        return;
      }
      active = true;
      document.documentElement.classList.add("topic-drag-active");
      paint(performance.now());
    }
    if (active) {
      next.preventDefault();
      callbacks.hover(dateAtPointer());
    }
  }
  function up(next: PointerEvent) {
    if (next.pointerId !== pointerId) return;
    x = next.clientX;
    y = next.clientY;
    finish(true);
  }
  function cancel(next?: Event) {
    if (
      next?.type === "pointercancel" &&
      (next as PointerEvent).pointerId !== pointerId
    )
      return;
    finish();
  }
  function key(next: KeyboardEvent) {
    if (next.key !== "Escape") return;
    next.preventDefault();
    next.stopImmediatePropagation();
    finish();
  }
  handle.setPointerCapture(pointerId);
  handle.addEventListener("lostpointercapture", cancel);
  window.addEventListener("pointermove", move, {
    capture: true,
    passive: false,
  });
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  return cancel;
}
