import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({ token: '' }),
  getters: {
    isAuthed: (s) => !!s.token,
  },
  actions: {
    setToken(t: string) {
      this.token = t
    },
    logout() {
      this.token = ''
    },
  },
  persist: true,
})