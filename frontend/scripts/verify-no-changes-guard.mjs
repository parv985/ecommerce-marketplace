/**
 * Verification for the "no changes → no update request" rule.
 *
 * Every Edit → Update form in this app must diff the submitted values against
 * the values the form was pre-filled with, and when nothing differs it has to
 * show "No changes to update." WITHOUT calling the update API.
 *
 * This script
 *   1. unit-tests the shared helpers in src/lib/formChanges.ts (the single
 *      source of truth for that comparison and for the message),
 *   2. audits every screen that can fire an update request and asserts it goes
 *      through those helpers,
 *   3. fails if a hand-rolled "No changes…" message appears anywhere, so the
 *      wording cannot drift per-form again.
 *
 * Run: node scripts/verify-no-changes-guard.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'src')

let passed = 0
const check = (label, fn) => {
  fn()
  passed += 1
  console.log(`  ok  ${label}`)
}

/* ------------------------------------------------------------------ */
/* 1. The shared diff helpers                                          */
/* ------------------------------------------------------------------ */

const vite = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
})

const {
  NO_CHANGES_MESSAGE,
  getChangedFields,
  hasChanges,
  isSameValue,
} = await vite.ssrLoadModule('/src/lib/formChanges.ts')

console.log('\nformChanges helpers')

check('the message is exactly what the product team asked for', () => {
  assert.equal(NO_CHANGES_MESSAGE, 'No changes to update.')
})

check('an untouched form produces no changed fields', () => {
  const original = { name: 'Wireless Trimmer', description: 'x', price: 799, stock: 12, sku: 'TRM-1', category: 'cat-1' }
  assert.deepEqual(getChangedFields({ ...original }, original), {})
  assert.equal(hasChanges({ ...original }, original), false)
})

check('null / undefined / empty string are the same "empty" value', () => {
  assert.equal(isSameValue(null, ''), true)
  assert.equal(isSameValue(undefined, ''), true)
  assert.equal(
    Object.keys(getChangedFields({ description: '' }, { description: null })).length,
    0,
  )
})

check('whitespace-only edits are not changes, but real edits are', () => {
  assert.equal(isSameValue('  Wireless Trimmer  ', 'Wireless Trimmer'), true)
  assert.deepEqual(getChangedFields({ name: 'Trim' }, { name: 'Trimmer' }), { name: 'Trim' })
})

check('number inputs compare numerically ("12" === 12, "1.50" === 1.5)', () => {
  assert.equal(isSameValue('12', 12), true)
  assert.equal(isSameValue('1.50', 1.5), true)
  // ...without swallowing an actual change (0 and '' are different things).
  assert.equal(isSameValue('0', ''), false)
  assert.deepEqual(getChangedFields({ price: 899 }, { price: 799 }), { price: 899 })
  assert.equal(hasChanges({ stock: '11' }, { stock: 12 }), true)
})

check('only the changed fields end up in the PATCH payload', () => {
  const next = { businessName: 'TrimCorp', phone: '9876543211', city: 'Ahmedabad' }
  const original = { businessName: 'TrimCorp', phone: '9876543210', city: 'Ahmedabad' }
  assert.deepEqual(getChangedFields(next, original), { phone: '9876543211' })
})

check('clearing a field counts as a change', () => {
  assert.deepEqual(getChangedFields({ addressLine2: '' }, { addressLine2: 'B-12' }), { addressLine2: '' })
})

check('missing baseline (data not loaded yet) is treated as a change', () => {
  assert.deepEqual(getChangedFields({ name: 'A' }, null), { name: 'A' })
  assert.equal(hasChanges({ name: 'A' }, undefined), true)
})

check('lists and nested values compare deeply', () => {
  assert.equal(isSameValue(['a', 'b'], ['a', 'b']), true)
  assert.equal(isSameValue(['a', 'b'], ['b', 'a']), false)
  assert.equal(isSameValue([{ key: 'k', value: 'v' }], [{ key: 'k', value: 'v' }]), true)
  assert.equal(isSameValue(['a'], []), false)
})

await vite.close()

/* ------------------------------------------------------------------ */
/* 2. Every screen that can update a record must use the guard         */
/* ------------------------------------------------------------------ */

/**
 * Update call sites and the screen that owns them. A new update flow has to be
 * added here — that is the point: the guard is not optional per form.
 */
const UPDATE_CALL_SITES = [
  ['src/pages/seller/SellerProductsPage.tsx', 'productService.update'],
  ['src/pages/seller/SellerProfilePage.tsx', 'sellerService.updateProfile'],
  ['src/pages/AccountPage.tsx', 'userService.updateProfile'],
  ['src/pages/admin/AdminCategoriesPage.tsx', 'categoryService.update'],
  ['src/pages/admin/AdminUsersPage.tsx', 'adminService.updateUserStatus'],
  ['src/pages/admin/AdminSellersPage.tsx', 'adminService.updateSellerStatus'],
  ['src/pages/admin/AdminProductsPage.tsx', 'adminService.updateProductStatus'],
  ['src/pages/admin/AdminSettlementsPage.tsx', 'adminService.updateCommission'],
  ['src/pages/seller/SellerOrdersPage.tsx', 'orderService.updateStatus'],
]

console.log('\nupdate call sites')

for (const [file, call] of UPDATE_CALL_SITES) {
  check(`${call} is guarded (${file})`, () => {
    const source = readFileSync(join(root, file), 'utf8')
    assert.ok(source.includes(call), `${file} no longer contains ${call}`)
    assert.ok(
      source.includes("from '@/lib/formChanges'"),
      `${file} must import the shared helpers from @/lib/formChanges`,
    )
    assert.ok(
      source.includes('notifyNoChanges'),
      `${file} must show notifyNoChanges() (="${NO_CHANGES_MESSAGE}") instead of calling ${call} with unchanged values`,
    )
  })
}

/**
 * The components that own the comparison for a pre-filled edit form. The diff
 * has to be computed there, so an update can never be sent with an empty diff.
 */
const DIFF_BASED_FORMS = [
  'src/pages/seller/SellerProductsPage.tsx',
  'src/pages/seller/SellerProfilePage.tsx',
  'src/pages/AccountPage.tsx',
  'src/components/admin/CategoryFormDialog.tsx',
  'src/pages/admin/AdminSettlementsPage.tsx',
]

console.log('\nedit forms diff against the loaded record')

for (const file of DIFF_BASED_FORMS) {
  check(`${file} diffs the submitted values`, () => {
    const source = readFileSync(join(root, file), 'utf8')
    assert.ok(
      /getChangedFields|hasChanges|isSameValue/.test(source),
      `${file} must compare form values with the loaded record (getChangedFields/hasChanges/isSameValue)`,
    )
  })
}

/* ------------------------------------------------------------------ */
/* 3. No per-form wording drift                                        */
/* ------------------------------------------------------------------ */

const walk = (dir) =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const sourceFiles = walk(srcDir).filter(f => /\.(ts|tsx)$/.test(f))

/** Comments may quote the message while explaining the rule — only code counts. */
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

console.log('\nsingle source of truth for the message')

check('only formChanges.ts spells the message out', () => {
  const offenders = sourceFiles
    .filter(f => !f.endsWith('lib/formChanges.ts'))
    .filter(f => /No changes to/.test(stripComments(readFileSync(f, 'utf8'))))
    .map(f => relative(root, f))
  assert.deepEqual(
    offenders,
    [],
    'hard-coded "No changes…" toasts drift per form — call notifyNoChanges() instead',
  )
})

check('the guard reports and returns — it never falls through to the request', () => {
  // Success toasts are produced by the mutations' onSuccess only, so a submit
  // path that stops at notifyNoChanges() cannot claim anything was saved.
  for (const [file] of UPDATE_CALL_SITES) {
    const source = readFileSync(join(root, file), 'utf8')
    assert.match(
      source,
      /notifyNoChanges\(\)\s*\n\s*return/,
      `${file} must show the message and return immediately when nothing changed`,
    )
    assert.ok(
      !/notifyNoChanges\(\)\s*\n?\s*toast\.(success|error)/.test(source),
      `${file} must not toast success/error on a no-change submit`,
    )
  }
})

console.log(`\n${passed} checks passed — no-op updates are blocked everywhere.\n`)
