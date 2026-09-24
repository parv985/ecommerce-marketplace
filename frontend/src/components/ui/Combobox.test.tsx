import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Combobox, type ComboboxOption } from './Combobox'

const OPTIONS: ComboboxOption[] = [
  { value: 'Gujarat', label: 'Gujarat' },
  { value: 'Goa', label: 'Goa' },
  { value: 'Rajasthan', label: 'Rajasthan' },
  { value: 'Ahmedabad', label: 'Ahmedabad', hint: 'Gujarat', state: 'Gujarat' },
]

function Harness({
  onChange,
  options = OPTIONS,
  loading = false,
  error,
  hint,
}: {
  onChange?: (option: ComboboxOption | null) => void
  options?: ComboboxOption[]
  loading?: boolean
  error?: string
  hint?: string
}) {
  const [value, setValue] = useState('')
  return (
    <Combobox
      label="State"
      value={value}
      options={options}
      loading={loading}
      error={error}
      hint={hint}
      onChange={(option) => {
        setValue(option?.value ?? '')
        onChange?.(option)
      }}
    />
  )
}

describe('Combobox', () => {
  it('filters options as the user types and commits the picked option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByRole('combobox', { name: 'State' })
    expect(input).toHaveAttribute('aria-expanded', 'false')

    await user.click(input)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(OPTIONS.length)

    await user.type(input, 'guj')
    // Matches the "Gujarat" label AND "Ahmedabad" via its Gujarat hint.
    expect(screen.getAllByRole('option')).toHaveLength(2)

    await user.click(screen.getByRole('option', { name: 'Gujarat' }))
    expect(onChange).toHaveBeenCalledWith({
      value: 'Gujarat',
      label: 'Gujarat',
    })
    expect(input).toHaveValue('Gujarat')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('matches against the hint so typing a state surfaces its cities', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('combobox', { name: 'State' }), 'gujarat')
    expect(
      screen.getByRole('option', { name: /Ahmedabad/ }),
    ).toBeInTheDocument()
  })

  it('shows the no-results state for an unmatched query', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('combobox', { name: 'State' }), 'zzzzz')
    expect(screen.getByText('No matches found')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('supports keyboard navigation and Enter to select', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByRole('combobox', { name: 'State' })
    await user.click(input)
    await user.keyboard('{ArrowDown}') // highlight index 1 → "Goa"
    expect(input).toHaveAttribute('aria-activedescendant')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledWith({ value: 'Goa', label: 'Goa' })
    expect(input).toHaveValue('Goa')
  })

  it('closes on Escape without changing the value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)

    const input = screen.getByRole('combobox', { name: 'State' })
    await user.click(input)
    await user.type(input, 'goa')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('')
  })

  it('clears the selection through the clear button', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<Harness onChange={onChange} />)

    const input = screen.getByRole('combobox', { name: 'State' })
    await user.click(input)
    await user.click(screen.getByRole('option', { name: 'Goa' }))
    expect(input).toHaveValue('Goa')

    await user.click(screen.getByRole('button', { name: 'Clear State' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(input).toHaveValue('')

    rerender(<Harness onChange={onChange} />)
  })

  it('closes when a click lands outside the component', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('combobox', { name: 'State' }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('renders error and hint messages', () => {
    const { rerender } = render(<Harness error="Not a valid Indian state" />)
    expect(screen.getByText('Not a valid Indian state')).toBeInTheDocument()

    rerender(<Harness hint="City was cleared" />)
    expect(screen.getByText('City was cleared')).toBeInTheDocument()

    // Both stay visible together: the hint explains the error it caused.
    rerender(<Harness error="City is required" hint="City was cleared" />)
    expect(screen.getByText('City is required')).toBeInTheDocument()
    expect(screen.getByText('City was cleared')).toBeInTheDocument()
  })

  it('caps the rendered rows and hints at narrowing the query', async () => {
    const user = userEvent.setup()
    const many: ComboboxOption[] = Array.from({ length: 300 }, (_, i) => ({
      value: `city-${i}`,
      label: `City ${String(i).padStart(3, '0')}`,
    }))
    render(<Harness options={many} />)

    await user.click(screen.getByRole('combobox', { name: 'State' }))
    expect(screen.getAllByRole('option')).toHaveLength(200)
    expect(
      screen.getByText(/Showing 200 of 300 — keep typing/),
    ).toBeInTheDocument()
  })

  it('shows a loading spinner and loading copy while options load', async () => {
    const user = userEvent.setup()
    render(<Harness loading options={[]} />)

    expect(screen.getByLabelText('Loading options')).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'State' }))
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
})
