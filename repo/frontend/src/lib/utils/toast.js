/**
 * Toast notification state management for the Hospitality Operations Management System.
 *
 * Provides a framework-agnostic state container that the Toast.svelte component
 * (or any other consumer) can drive.  Auto-dismiss is handled via setTimeout so
 * the timing logic is testable with fake timers.
 */

/**
 * Create an isolated toast state manager.
 *
 * @returns {{ get: () => Array, add: (message: string, type?: string, duration?: number) => number, remove: (id: number) => void, clear: () => void }}
 */
export function createToastState() {
  let toasts = [];
  let nextId = 0;

  return {
    /** Return the current list of toasts. */
    get() {
      return toasts;
    },

    /**
     * Add a new toast notification.
     *
     * @param {string} message - Display text.
     * @param {string} [type='info'] - Visual variant: 'info' | 'success' | 'warning' | 'error'.
     * @param {number} [duration=5000] - Auto-dismiss delay in ms.  Pass 0 to disable.
     * @returns {number} The id of the newly created toast.
     */
    add(message, type = 'info', duration = 5000) {
      const id = nextId++;
      const toast = { id, message, type, duration };
      toasts = [...toasts, toast];

      if (duration > 0) {
        setTimeout(() => this.remove(id), duration);
      }

      return id;
    },

    /**
     * Remove a toast by its id.
     * @param {number} id
     */
    remove(id) {
      toasts = toasts.filter(t => t.id !== id);
    },

    /** Remove all toasts. */
    clear() {
      toasts = [];
    }
  };
}
