import { ref } from 'vue'

export type ToastType = 'error' | 'info' | 'success'

export interface Toast {
    id: number
    message: string
    type: ToastType
}

const MAX_VISIBLE = 3
let nextId = 0
const toasts = ref<Toast[]>([])

function show(message: string, type: ToastType = 'info', durationMs = 4000) {
    const id = ++nextId
    const toast: Toast = { id, message, type }

    // Cap visible toasts
    if (toasts.value.length >= MAX_VISIBLE) {
        toasts.value = toasts.value.slice(1)
    }
    toasts.value = [...toasts.value, toast]

    if (durationMs > 0) {
        setTimeout(() => remove(id), durationMs)
    }
}

function remove(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
}

export function useToast() {
    return {
        toasts,
        show,
        remove,
    }
}
