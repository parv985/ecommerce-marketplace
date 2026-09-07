import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminService } from '@/services/admin.service'
import { formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Pagination } from '@/components/ui/Pagination'
import { toast } from 'react-hot-toast'

export function AdminUsersPage() {
  const [page, setPage] = useState(1)
  const [roleFilter, setRoleFilter] = useState('')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['admin-users', page, roleFilter],
    queryFn: () => adminService.getUsers({ page, role: roleFilter || undefined }),
  })

  const toggleStatus = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminService.updateUserStatus(id, isActive),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-users'] }); toast.success('User status updated') },
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Manage Users</h1>
      <div className="flex gap-2 mb-4">
        {['', 'BUYER', 'SELLER', 'SUPER_ADMIN'].map(r => (
          <button key={r} onClick={() => { setRoleFilter(r); setPage(1); }}
            className={`px-3 py-1 text-sm rounded ${roleFilter === r ? 'bg-slate-900 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}>
            {r || 'All'}
          </button>
        ))}
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 border-b">
            <tr>
              <th className="text-left p-3 font-medium">User</th>
              <th className="text-left p-3 font-medium">Role</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-left p-3 font-medium">Joined</th>
              <th className="p-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map(u => (
              <tr key={u.id} className="border-b">
                <td className="p-3"><p className="font-medium">{u.name}</p><p className="text-xs text-[var(--muted)]">{u.email}</p></td>
                <td className="p-3"><Badge variant={u.role === 'SUPER_ADMIN' ? 'error' : u.role === 'SELLER' ? 'secondary' : 'default'}>{u.role}</Badge></td>
                <td className="p-3"><Badge variant={u.isActive ? 'success' : 'error'}>{u.isActive ? 'Active' : 'Inactive'}</Badge></td>
                <td className="p-3 text-[var(--muted)]">{formatDate(u.createdAt)}</td>
                <td className="p-3 text-center">
                  <Button size="sm" variant={u.isActive ? 'destructive' : 'outline'} onClick={() => toggleStatus.mutate({ id: u.id, isActive: !u.isActive })}>
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <div className="p-4"><Pagination currentPage={page} totalPages={data.totalPages} onPageChange={setPage} /></div>}
      </div>
    </div>
  )
}
