<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import Icon from "./Icon.vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: { value: string; label: string }[];
    label: string;
    searchable?: boolean;
    disabled?: boolean;
  }>(),
  { searchable: false, disabled: false },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const id = useId();
const trigger = ref<HTMLButtonElement>();
const popup = ref<HTMLElement>();
const search = ref<HTMLInputElement>();
const list = ref<HTMLElement>();
const opened = ref(false);
const query = ref("");
const active = ref(-1);
const position = ref<Record<string, string>>({});
const filtered = computed(() =>
  props.options.filter((option) =>
    option.label
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const selected = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const optionId = (index: number) => `${id}-option-${index}`;
let typed = "";
let typeTimer: ReturnType<typeof setTimeout> | undefined;

function place() {
  const rect = trigger.value?.getBoundingClientRect();
  if (!rect) return;
  const below = window.innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  const flip = below < 230 && above > below;
  position.value = {
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 240) - 8))}px`,
    width: `${Math.min(Math.max(rect.width, 240), window.innerWidth - 16)}px`,
    maxHeight: `${Math.min(360, flip ? above : below)}px`,
    ...(flip
      ? {
          bottom: `${window.innerHeight - rect.top + 6}px`,
          transformOrigin: "bottom center",
        }
      : { top: `${rect.bottom + 6}px`, transformOrigin: "top center" }),
  };
}
function reveal() {
  void nextTick(() =>
    list.value
      ?.querySelector<HTMLElement>(`[id="${optionId(active.value)}"]`)
      ?.scrollIntoView({ block: "nearest" }),
  );
}
function close(restore = false) {
  opened.value = false;
  if (restore) trigger.value?.focus({ preventScroll: true });
}
async function open() {
  if (props.disabled) return;
  query.value = "";
  active.value = Math.max(
    0,
    props.options.findIndex((option) => option.value === props.modelValue),
  );
  place();
  opened.value = true;
  await nextTick();
  (search.value || list.value)?.focus({ preventScroll: true });
  reveal();
}
function choose(index: number) {
  const option = filtered.value[index];
  if (!option) return;
  emit("update:modelValue", option.value);
  close(true);
}
function key(event: KeyboardEvent) {
  if (event.key === "Escape" && opened.value) {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  } else if (event.key === "Tab" && opened.value) {
    trigger.value?.focus({ preventScroll: true });
    close();
  } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    // Keep normal cursor movement in the search field for Home and End.
    if (event.target === search.value && ["Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    if (!opened.value) {
      void open();
      return;
    }
    const count = filtered.value.length;
    if (!count) return;
    active.value =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? count - 1
          : (active.value + (event.key === "ArrowDown" ? 1 : -1) + count) %
            count;
    reveal();
  } else if (
    opened.value &&
    (event.key === "Enter" || (event.key === " " && !props.searchable))
  ) {
    event.preventDefault();
    choose(active.value);
  } else if (
    opened.value &&
    !props.searchable &&
    event.key.length === 1 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    event.preventDefault();
    typed += event.key.toLocaleLowerCase();
    clearTimeout(typeTimer);
    typeTimer = setTimeout(() => {
      typed = "";
    }, 600);
    const index = filtered.value.findIndex((option) =>
      option.label.toLocaleLowerCase().startsWith(typed),
    );
    if (index >= 0) {
      active.value = index;
      reveal();
    }
  }
}
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (!trigger.value?.contains(target) && !popup.value?.contains(target))
    close();
}
function scroll(event: Event) {
  if (!popup.value?.contains(event.target as Node)) close();
}
watch(query, () => {
  active.value = filtered.value.length ? 0 : -1;
  reveal();
});
watch(
  () => props.disabled,
  (value) => {
    if (value) close();
  },
);
watch(opened, (value) => {
  if (value) {
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
  } else cleanup();
});
function cleanup() {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", place);
  window.removeEventListener("scroll", scroll, true);
  clearTimeout(typeTimer);
  typed = "";
}
onBeforeUnmount(cleanup);
</script>

<template>
  <div class="app-select" :class="{ 'is-open': opened }">
    <button
      ref="trigger"
      type="button"
      class="app-select-trigger"
      :disabled="disabled"
      :aria-label="`${label}: ${selected?.label || 'Не выбрано'}`"
      aria-haspopup="listbox"
      :aria-expanded="opened"
      :aria-controls="opened ? `${id}-list` : undefined"
      @click="opened ? close(true) : open()"
      @keydown="key"
    >
      <span>{{ selected?.label || "Не выбрано" }}</span>
      <Icon name="next" :size="16" class="app-select-chevron" />
    </button>
    <Teleport to="body">
      <Transition name="select-popup">
        <div
          v-if="opened"
          ref="popup"
          class="app-select-popup"
          :style="position"
          @keydown="key"
        >
          <div v-if="searchable" class="app-select-search">
            <Icon name="search" :size="16" />
            <input
              ref="search"
              v-model="query"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              :aria-controls="`${id}-list`"
              :aria-label="`Поиск: ${label}`"
              :aria-activedescendant="
                active >= 0 ? optionId(active) : undefined
              "
              placeholder="Найти…"
              autocomplete="off"
              @keydown.enter.prevent
            />
          </div>
          <div
            :id="`${id}-list`"
            ref="list"
            class="app-select-options"
            role="listbox"
            :aria-label="label"
            :tabindex="searchable ? -1 : 0"
            :aria-activedescendant="active >= 0 ? optionId(active) : undefined"
          >
            <div
              v-for="(option, index) in filtered"
              :id="optionId(index)"
              :key="option.value"
              role="option"
              class="app-select-option"
              :class="{
                active: active === index,
                selected: modelValue === option.value,
              }"
              :aria-selected="modelValue === option.value"
              @pointermove="active = index"
              @pointerdown.prevent
              @click="choose(index)"
            >
              <span>{{ option.label }}</span
              ><Icon
                v-if="modelValue === option.value"
                name="check"
                :size="16"
              />
            </div>
            <p v-if="!filtered.length" class="app-select-empty" role="status">
              Ничего не найдено
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app-select {
  min-width: 0;
  width: 100%;
  margin-top: 8px;
}
.app-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 11px 12px;
  background: var(--input);
  color: var(--text);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;
  transition:
    border-color 180ms,
    box-shadow 180ms,
    background 180ms;
}
.app-select-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-select-trigger:hover:not(:disabled) {
  border-color: var(--accent);
}
.app-select-trigger:focus-visible,
.is-open .app-select-trigger {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent);
}
.app-select-chevron {
  flex-shrink: 0;
  color: var(--muted);
  transform: rotate(90deg);
  transition: transform 220ms ease;
}
.is-open .app-select-chevron {
  transform: rotate(270deg);
  color: var(--accent-text);
}
.app-select-popup {
  position: fixed;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  box-shadow:
    0 12px 36px #15132424,
    0 2px 6px #1513240a;
  overflow: hidden;
}
.app-select-search {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 5px 8px 10px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}
.app-select-search input {
  min-width: 0;
  margin: 0;
  padding: 6px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  font-size: 12px;
}
.app-select-search input:focus {
  box-shadow: none;
}
.app-select-options {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  outline: none;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}
.app-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 11px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
  transition:
    background 130ms,
    color 130ms;
}
.app-select-option > span {
  overflow-wrap: anywhere;
}
.app-select-option > svg {
  flex-shrink: 0;
}
.app-select-option.active {
  background: var(--surface-soft);
}
.app-select-option.selected {
  color: var(--accent-text);
  font-weight: 550;
}
.app-select-option.selected.active {
  background: var(--lavender);
}
.app-select-empty {
  padding: 18px 10px;
  margin: 0;
  text-align: center;
  color: var(--muted);
  font-size: 12px;
}
.select-popup-enter-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.select-popup-leave-active {
  transition:
    opacity 130ms ease,
    transform 150ms ease;
  pointer-events: none;
}
.select-popup-enter-from,
.select-popup-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .select-popup-enter-active,
  .select-popup-leave-active,
  .app-select-chevron,
  .app-select-trigger,
  .app-select-option {
    transition: none;
  }
}
</style>
