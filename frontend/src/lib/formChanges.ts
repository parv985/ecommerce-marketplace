import { toast } from 'react-hot-toast'

/*
 * ---------------------------------------------------------------------------
 * Shared "did the user actually change anything?" helpers for edit/update forms
 * ---------------------------------------------------------------------------
 *
 * Every Edit → Update flow in the app (products, buyer profile, seller profile,
 * categories, commission, status dialogs, …) must:
 *
 *   1. compare the submitted form values with the values the form was pre-filled
 *      from,
 *   2. when nothing differs, show `NO_CHANGES_MESSAGE` and NOT call the API,
 *   3. only send the request (and the success toast) when a real change exists.
 *
 * Keeping the comparison here guarantees all forms behave identically and show
 * exactly the same message instead of inventing per-form variants.
 */

/** The one message used everywhere an update form is submitted untouched. */
export const NO_CHANGES_MESSAGE = 'No changes to update.'

/** Shows the standard "pristine form" toast. Use it instead of `toast.error`. */
export function notifyNoChanges(): void {
  toast(NO_CHANGES_MESSAGE)
}

/**
 * Coerces a value into something comparable:
 *  - `null` / `undefined` → `''` (a cleared input and a missing API field mean the same thing)
 *  - strings are trimmed (inputs and the API differ on trailing whitespace only)
 *  - `Date` → epoch ms, so the same instant written two ways still matches
 *  - arrays / plain objects are mapped recursively
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (value instanceof Set) return normalizeValue(Array.from(value))
  if (Array.isArray(value)) return value.map(normalizeValue)
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = normalizeValue(source[key])
        return acc
      }, {})
  }
  return value
}

/** A normalized `{ ... }` record (arrays excluded) — safe to compare key by key. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `'12'` → 12, `'1.50'` → 1.5. Anything non-numeric returns `null`. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Loose equality tuned for form values:
 * `'10'` and `10` are the same value, as are `null`, `undefined` and `''`.
 */
export function isSameValue(a: unknown, b: unknown): boolean {
  const left = normalizeValue(a)
  const right = normalizeValue(b)

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, i) => isSameValue(item, right[i]))
  }
  if (left === right) return true
  if (isPlainRecord(left) && isPlainRecord(right)) {
    const keys = Object.keys(left)
    return (
      keys.length === Object.keys(right).length &&
      keys.every(key => isSameValue(left[key], right[key]))
    )
  }

  const leftNumber = toNumber(left)
  const rightNumber = toNumber(right)
  if (leftNumber !== null && rightNumber !== null) return leftNumber === rightNumber

  return false
}

/** True when every field of `next` still matches `original`. */
export function hasChanges<T extends object>(next: T, original: Partial<T> | null | undefined): boolean {
  return Object.keys(getChangedFields(next, original)).length > 0
}

/**
 * The changed fields only — the PATCH payload to send. Fields left untouched are
 * omitted, so an update never re-writes values the user did not edit.
 */
export function getChangedFields<T extends object>(
  next: T,
  original: Partial<T> | null | undefined,
): Partial<T> {
  const changed: Partial<T> = {}
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (!isSameValue(next[key], original?.[key])) {
      changed[key] = next[key]
    }
  }
  return changed
}
