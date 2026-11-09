import { defineStore } from "pinia";
import { ref } from "vue";
export const useUI = defineStore("ui", () => {
  const message = ref(""),
    kind = ref("success"),
    dark = ref(localStorage.getItem("studyflow-theme") === "dark");
  let timer: ReturnType<typeof setTimeout>;
  function notify(text: string, error = false) {
    message.value = text;
    kind.value = error ? "error" : "success";
    clearTimeout(timer);
    timer = setTimeout(() => (message.value = ""), 5000);
  }
  function apply() {
    document.documentElement.classList.toggle("dark", dark.value);
    localStorage.setItem("studyflow-theme", dark.value ? "dark" : "light");
  }
  function toggleTheme() {
    dark.value = !dark.value;
    apply();
  }
  apply();
  return { message, kind, dark, notify, toggleTheme };
});
