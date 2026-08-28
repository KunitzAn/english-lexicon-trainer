import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import { auth, fetchMe } from '@/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
  ],
})

router.beforeEach(async (to) => {
  if (!auth.loaded) await fetchMe()
  if (to.meta.requiresAuth && !auth.user) return { name: 'login' }
  if (to.name === 'login' && auth.user) return { name: 'home' }
  return true
})
