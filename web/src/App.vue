<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import { auth } from '@/auth'

const route = useRoute()
const showHeader = computed(() => auth.user && route.name !== 'login')
</script>

<template>
  <AppHeader v-if="showHeader" />
  <router-view />
</template>
