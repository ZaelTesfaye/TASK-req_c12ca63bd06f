/**
 * Unit tests for the toast notification state module.
 * Source: src/lib/utils/toast.js
 *
 * Covers add / remove / clear / auto-dismiss timing using fake timers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createToastState } from '../../src/lib/utils/toast.js';

describe('createToastState', () => {
  let toasts;

  beforeEach(() => {
    vi.useFakeTimers();
    toasts = createToastState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // add()
  // -------------------------------------------------------------------------
  it('creates a toast with correct default properties', () => {
    const id = toasts.add('Hello');
    const list = toasts.get();

    expect(list.length).toBe(1);
    expect(list[0].id).toBe(id);
    expect(list[0].message).toBe('Hello');
    expect(list[0].type).toBe('info');
    expect(list[0].duration).toBe(5000);
  });

  it('respects custom type and duration', () => {
    toasts.add('Error!', 'error', 3000);
    const t = toasts.get()[0];
    expect(t.type).toBe('error');
    expect(t.duration).toBe(3000);
  });

  it('assigns unique ids to each toast', () => {
    const id1 = toasts.add('First');
    const id2 = toasts.add('Second');
    const id3 = toasts.add('Third');
    expect(new Set([id1, id2, id3]).size).toBe(3);
  });

  it('multiple toasts can coexist', () => {
    toasts.add('A');
    toasts.add('B');
    toasts.add('C');
    expect(toasts.get().length).toBe(3);
    expect(toasts.get().map(t => t.message)).toEqual(['A', 'B', 'C']);
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------
  it('removes a toast by id', () => {
    const id1 = toasts.add('Keep');
    const id2 = toasts.add('Remove me');
    toasts.remove(id2);

    const list = toasts.get();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(id1);
  });

  it('is a no-op when removing a non-existent id', () => {
    toasts.add('Stay');
    toasts.remove(9999);
    expect(toasts.get().length).toBe(1);
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------
  it('removes all toasts', () => {
    toasts.add('A');
    toasts.add('B');
    toasts.add('C');
    toasts.clear();
    expect(toasts.get()).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // auto-dismiss timing
  // -------------------------------------------------------------------------
  it('auto-dismisses after the specified duration', () => {
    toasts.add('Temporary', 'info', 2000);
    expect(toasts.get().length).toBe(1);

    vi.advanceTimersByTime(1999);
    expect(toasts.get().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(toasts.get().length).toBe(0);
  });

  it('auto-dismisses using the default 5000ms when duration is omitted', () => {
    toasts.add('Default timing');
    vi.advanceTimersByTime(4999);
    expect(toasts.get().length).toBe(1);

    vi.advanceTimersByTime(1);
    expect(toasts.get().length).toBe(0);
  });

  it('does not auto-dismiss when duration is 0', () => {
    toasts.add('Sticky', 'warning', 0);
    vi.advanceTimersByTime(60000);
    expect(toasts.get().length).toBe(1);
  });

  it('each toast auto-dismisses independently', () => {
    toasts.add('Short', 'info', 1000);
    toasts.add('Long', 'info', 3000);

    vi.advanceTimersByTime(1000);
    expect(toasts.get().length).toBe(1);
    expect(toasts.get()[0].message).toBe('Long');

    vi.advanceTimersByTime(2000);
    expect(toasts.get().length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // edge cases
  // -------------------------------------------------------------------------
  it('get() returns an empty array initially', () => {
    expect(toasts.get()).toEqual([]);
  });

  it('supports all four toast types', () => {
    for (const type of ['info', 'success', 'warning', 'error']) {
      toasts.add(`msg-${type}`, type, 0);
    }
    const types = toasts.get().map(t => t.type);
    expect(types).toEqual(['info', 'success', 'warning', 'error']);
  });
});
