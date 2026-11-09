import { defineStore } from "pinia";
import { ref } from "vue";
import { api, ApiError } from "../services/api";
import type { User } from "../types";
export const useAuth = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const authOpen = ref(false),
    authReason = ref("Войдите, чтобы сохранить свой прогресс");
  let pending: (() => void | Promise<void>) | undefined;
  function requireLogin(action?: () => void | Promise<void>, reason?: string) {
    if (user.value) return true;
    pending = action;
    authReason.value = reason || "Войдите, чтобы сохранить свой прогресс";
    authOpen.value = true;
    return false;
  }
  async function finishAuth() {
    authOpen.value = false;
    const action = pending;
    pending = undefined;
    await action?.();
  }
  function cancelAuth() {
    authOpen.value = false;
    pending = undefined;
  }
  let ready: Promise<void> | undefined;
  function init() {
    return (ready ||= api<{ user: User }>("/auth/me")
      .then((r) => {
        user.value = r.user;
      })
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status !== 401) {
          ready = undefined;
          throw e;
        }
      }));
  }
  async function authenticate(mode: string, data: unknown) {
    user.value = (
      await api<{ user: User }>(`/auth/${mode}`, "POST", data)
    ).user;
  }
  async function update(data: Partial<User>) {
    user.value = (await api<{ user: User }>("/users/me", "PATCH", data)).user;
  }
  async function logout() {
    await api("/auth/logout", "POST");
    user.value = null;
  }
  return {
    user,
    init,
    authenticate,
    update,
    logout,
    authOpen,
    authReason,
    requireLogin,
    finishAuth,
    cancelAuth,
  };
});
