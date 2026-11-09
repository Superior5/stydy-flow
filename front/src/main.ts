import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import CalendarView from "./views/CalendarView.vue";
import ProfileView from "./views/ProfileView.vue";
import ProgressView from "./views/ProgressView.vue";
import { useAuth } from "./stores/auth";
import "./style.css";
const pinia = createPinia();
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: CalendarView },
    { path: "/studio", component: CalendarView, meta: { requiresAuth: true } },
    { path: "/profile", component: ProfileView, meta: { requiresAuth: true } },
    {
      path: "/progress",
      component: ProgressView,
      meta: { requiresAuth: true },
    },
    {
      path: "/auth",
      redirect: () => {
        useAuth(pinia).requireLogin();
        return "/";
      },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
router.beforeEach(async (to) => {
  const auth = useAuth(pinia);
  try {
    await auth.init();
  } catch {
    /* Public calendar remains reachable during an authentication check failure. */
  }
  if (to.meta.requiresAuth && !auth.user) {
    auth.requireLogin(async () => {
      await router.push(to.fullPath);
    }, "Войдите, чтобы открыть личное пространство");
    return "/";
  }
});
createApp(App).use(pinia).use(router).mount("#app");
