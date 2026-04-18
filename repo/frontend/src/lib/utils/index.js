/**
 * Utility functions for the Hospitality Operations Management System.
 */

/**
 * Format a date value into a human-readable string.
 * @param {string|Date|number} value - Date value to format.
 * @param {object} [options] - Intl.DateTimeFormat options.
 * @param {string} [options.locale='en-US'] - Locale string.
 * @param {string} [options.format='medium'] - Shorthand: 'short', 'medium', 'long', 'full', or custom Intl options.
 * @returns {string} Formatted date string, or empty string if invalid.
 */
export function formatDate(value, options = {}) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';

  const { locale = 'en-US', format = 'medium', ...intlOptions } = options;

  const presets = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    datetime: { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' },
    time: { hour: 'numeric', minute: '2-digit' }
  };

  const formatOptions = presets[format] || intlOptions;

  try {
    return new Intl.DateTimeFormat(locale, formatOptions).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Format a number as currency.
 * @param {number} amount - The amount to format.
 * @param {string} [currency='USD'] - ISO 4217 currency code.
 * @param {string} [locale='en-US'] - Locale string.
 * @returns {string} Formatted currency string, or empty string if invalid.
 */
export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  if (amount == null || isNaN(amount)) return '';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

/**
 * Create a debounced version of a function.
 * @param {Function} fn - The function to debounce.
 * @param {number} [delay=300] - Delay in milliseconds.
 * @returns {Function} Debounced function with a .cancel() method.
 */
export function debounce(fn, delay = 300) {
  let timeoutId;

  const debounced = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };

  debounced.cancel = function () {
    clearTimeout(timeoutId);
  };

  return debounced;
}

/**
 * Conditionally join CSS class names.
 * Accepts strings, objects (key = class, value = condition), and arrays.
 * Falsy values are filtered out.
 *
 * @param {...(string|object|Array|undefined|null|false)} args - Class name inputs.
 * @returns {string} Joined class string.
 *
 * @example
 * classNames('btn', { 'btn-primary': true, 'btn-disabled': false }, 'ml-2')
 * // => 'btn btn-primary ml-2'
 */
export function classNames(...args) {
  const classes = [];

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg === 'string') {
      classes.push(arg);
    } else if (Array.isArray(arg)) {
      const inner = classNames(...arg);
      if (inner) classes.push(inner);
    } else if (typeof arg === 'object') {
      for (const [key, value] of Object.entries(arg)) {
        if (value) classes.push(key);
      }
    }
  }

  return classes.join(' ');
}

/**
 * Mask sensitive data for display purposes.
 * Shows only the last N characters, replacing the rest with a mask character.
 *
 * @param {string} value - The value to mask.
 * @param {object} [options] - Masking options.
 * @param {number} [options.visibleChars=4] - Number of characters to keep visible at the end.
 * @param {string} [options.maskChar='*'] - Character used for masking.
 * @param {number} [options.minMaskLength=4] - Minimum number of mask characters shown.
 * @param {string} [options.type='default'] - Predefined type: 'email', 'phone', 'card', 'default'.
 * @returns {string} Masked string, or empty string if no value.
 */
export function maskField(value, options = {}) {
  if (!value || typeof value !== 'string') return '';

  const {
    visibleChars = 4,
    maskChar = '*',
    minMaskLength = 4,
    type = 'default'
  } = options;

  switch (type) {
    case 'email': {
      const atIndex = value.indexOf('@');
      if (atIndex <= 0) return maskChar.repeat(minMaskLength);
      const localPart = value.substring(0, atIndex);
      const domain = value.substring(atIndex);
      const visible = Math.min(2, localPart.length);
      return localPart.substring(0, visible) +
        maskChar.repeat(Math.max(minMaskLength, localPart.length - visible)) +
        domain;
    }
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      if (digits.length < 4) return maskChar.repeat(minMaskLength);
      return maskChar.repeat(digits.length - 4) + digits.slice(-4);
    }
    case 'card': {
      const cardDigits = value.replace(/\D/g, '');
      if (cardDigits.length < 4) return maskChar.repeat(minMaskLength);
      return maskChar.repeat(cardDigits.length - 4) + cardDigits.slice(-4);
    }
    default: {
      if (value.length <= visibleChars) {
        return maskChar.repeat(minMaskLength);
      }
      const maskLength = Math.max(minMaskLength, value.length - visibleChars);
      return maskChar.repeat(maskLength) + value.slice(-visibleChars);
    }
  }
}
