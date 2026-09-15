import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentUpload } from './DocumentUpload'
import type { SellerDocument } from '@/types/api'

const { toastError, toastSuccess } = vi.hoisted(() => ({ toastError: vi.fn(), toastSuccess: vi.fn() }))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { error: toastError, success: toastSuccess })
  return { toast, default: toast }
})

const docs: SellerDocument[] = [
  { type: 'GST', url: 'https://cdn.example/seller-documents/doc_gst.pdf', publicId: 'seller-documents/doc_gst.pdf', fileName: 'gst-cert.pdf', size: 2048 },
  { type: 'PAN_CARD', url: 'https://cdn.example/seller-documents/pan.jpg', publicId: 'seller-documents/pan.jpg', size: 512 * 1024 },
]

const pickFile = (input: HTMLInputElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

const getFileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})

describe('DocumentUpload', () => {
  it('renders existing documents with normalised type labels, size, links and Pending status', () => {
    render(<DocumentUpload existingDocuments={docs} onUpload={vi.fn()} onDelete={vi.fn()} />)

    // Type badges (the select's <option>s share the same labels, so scope to list items)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('GST Certificate') // legacy "GST" alias normalised
    expect(items[1]).toHaveTextContent('PAN Card')
    expect(screen.getByText('gst-cert.pdf')).toBeInTheDocument()
    expect(screen.getByText('pan.jpg')).toBeInTheDocument() // derived from URL
    expect(items[0]).toHaveTextContent('2.0 KB')
    expect(items[1]).toHaveTextContent('512.0 KB')
    expect(screen.getAllByText('Pending')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /view/i })[0]).toHaveAttribute('href', docs[0].url)
    expect(screen.getAllByRole('link', { name: /download/i })[0]).toHaveAttribute('download', 'gst-cert.pdf')
  })

  it('rejects unsupported and oversized files', () => {
    const onUpload = vi.fn()
    render(<DocumentUpload onUpload={onUpload} />)

    pickFile(getFileInput(), new File(['x'], 'notes.txt', { type: 'text/plain' }))
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/not supported/i))

    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    pickFile(getFileInput(), big)
    expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/10 MB/))
    expect(onUpload).not.toHaveBeenCalled()
  })

  it('requires a document type, then uploads with the selected type and resets', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn().mockResolvedValue(undefined)
    render(<DocumentUpload onUpload={onUpload} />)

    pickFile(getFileInput(), new File(['%PDF'], 'bank.pdf', { type: 'application/pdf' }))
    expect(screen.getByText('bank.pdf')).toBeInTheDocument()

    // Upload is disabled until a type is selected
    const uploadBtn = screen.getByRole('button', { name: /^upload$/i })
    expect(uploadBtn).toBeDisabled()

    await user.selectOptions(screen.getByRole('combobox'), 'BANK_STATEMENT')
    await user.click(uploadBtn)

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1))
    expect(onUpload.mock.calls[0][0].name).toBe('bank.pdf')
    expect(onUpload.mock.calls[0][1]).toBe('BANK_STATEMENT')
    await waitFor(() => expect(screen.queryByText('bank.pdf')).not.toBeInTheDocument())
  })

  it('keeps the pending file when the upload fails', async () => {
    const user = userEvent.setup()
    const onUpload = vi.fn().mockRejectedValue(new Error('boom'))
    render(<DocumentUpload onUpload={onUpload} />)

    pickFile(getFileInput(), new File(['%PDF'], 'gst.pdf', { type: 'application/pdf' }))
    await user.selectOptions(screen.getByRole('combobox'), 'GST_CERTIFICATE')
    await user.click(screen.getByRole('button', { name: /^upload$/i }))

    await waitFor(() => expect(onUpload).toHaveBeenCalled())
    expect(screen.getByText('gst.pdf')).toBeInTheDocument()
  })

  it('asks for confirmation before deleting and passes the publicId', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<DocumentUpload existingDocuments={docs} onUpload={vi.fn()} onDelete={onDelete} />)

    await user.click(screen.getByRole('button', { name: /delete gst-cert\.pdf/i }))
    expect(screen.getByText(/delete document\?/i)).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))
    expect(onDelete).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /delete gst-cert\.pdf/i }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('seller-documents/doc_gst.pdf'))
  })

  it('locks all controls when disabled or while an operation is in progress', () => {
    const { rerender } = render(
      <DocumentUpload existingDocuments={docs} onUpload={vi.fn()} onDelete={vi.fn()} disabled disabledReason="Account suspended" />,
    )
    expect(screen.getByText('Account suspended')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(getFileInput()).toBeDisabled()
    screen.getAllByRole('button', { name: /^delete /i }).forEach((b) => expect(b).toBeDisabled())

    rerender(<DocumentUpload existingDocuments={docs} onUpload={vi.fn()} onDelete={vi.fn()} deletingPublicId="seller-documents/pan.jpg" />)
    screen.getAllByRole('button', { name: /^delete /i }).forEach((b) => expect(b).toBeDisabled())
    expect(getFileInput()).toBeDisabled()
  })
})
