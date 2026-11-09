import { onMounted, onBeforeUnmount, nextTick, type Ref } from "vue";

type DialogEntry = {
  panel: Ref<HTMLElement | undefined>;
  previous: HTMLElement | null;
};
const dialogs: DialogEntry[] = [];
let previousOverflow = "";
const focusable =
  "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]";
function updateLayers() {
  dialogs.forEach((entry, index) => {
    const backdrop = entry.panel.value?.closest<HTMLElement>(
      ".modal-backdrop,.drawer-backdrop",
    );
    if (!backdrop) return;
    const covered = index !== dialogs.length - 1;
    backdrop.inert = covered;
    backdrop.style.visibility = covered ? "hidden" : "";
    if (covered) backdrop.setAttribute("aria-hidden", "true");
    else backdrop.removeAttribute("aria-hidden");
  });
}
export function useDialog(
  panel: Ref<HTMLElement | undefined>,
  close: () => void,
) {
  const entry: DialogEntry = {
    panel,
    previous: document.activeElement as HTMLElement | null,
  };
  const isTop = () => dialogs[dialogs.length - 1] === entry;
  function key(event: KeyboardEvent) {
    if (!isTop()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = panel.value?.querySelectorAll<HTMLElement>(focusable);
    if (!items?.length) return;
    const first = items[0],
      last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }
  onMounted(async () => {
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogs.push(entry);
    updateLayers();
    document.addEventListener("keydown", key);
    await nextTick();
    if (isTop())
      (
        panel.value?.querySelector<HTMLInputElement>("input") ||
        panel.value?.querySelector<HTMLElement>(focusable)
      )?.focus({ preventScroll: true });
  });
  onBeforeUnmount(() => {
    const wasTop = isTop(),
      index = dialogs.indexOf(entry);
    if (index !== -1) dialogs.splice(index, 1);
    document.removeEventListener("keydown", key);
    updateLayers();
    if (!dialogs.length) document.body.style.overflow = previousOverflow;
    if (wasTop) {
      if (entry.previous?.isConnected && !entry.previous.closest("[inert]"))
        entry.previous.focus({ preventScroll: true });
      else
        dialogs[dialogs.length - 1]?.panel.value
          ?.querySelector<HTMLElement>(focusable)
          ?.focus({ preventScroll: true });
    }
  });
}
