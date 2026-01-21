import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

function createToastStore() {
    const { subscribe, update } = writable<Toast[]>([]);

    let idCounter = 0;

    return {
        subscribe,
        show(message: string, type: ToastType = 'info', duration = 4000) {
            const id = `toast-${++idCounter}`;
            const toast: Toast = { id, message, type, duration };

            update(toasts => [...toasts, toast]);

            if (duration > 0) {
                setTimeout(() => {
                    this.dismiss(id);
                }, duration);
            }

            return id;
        },
        success(message: string, duration = 4000) {
            return this.show(message, 'success', duration);
        },
        error(message: string, duration = 5000) {
            return this.show(message, 'error', duration);
        },
        warning(message: string, duration = 4000) {
            return this.show(message, 'warning', duration);
        },
        info(message: string, duration = 4000) {
            return this.show(message, 'info', duration);
        },
        dismiss(id: string) {
            update(toasts => toasts.filter(t => t.id !== id));
        },
        clear() {
            update(() => []);
        }
    };
}

export const toast = createToastStore();
