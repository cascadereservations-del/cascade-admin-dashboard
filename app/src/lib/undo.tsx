import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { rpc } from '@/lib/rpc';
import { toAppError } from '@/lib/errors';

// Every admin write on an audited table returns the audit row it produced.
// The success toast carries an Undo action for that row; the server restores
// the recorded before-state (or soft-deletes a fresh create) and records the
// undo itself, so Settings → Audit history shows both halves.

export function undoAudit(auditId: string, reason = 'undo from the toast') {
  return rpc<{ ok: boolean; id: string; auditId: string | null }>('admin_undo_v1', { p_audit_id: auditId, p_reason: reason });
}

export function softDelete(table: string, id: string, reason: string) {
  return rpc<{ ok: boolean; id: string; auditId: string | null }>('admin_soft_delete_v1', { p_table: table, p_id: id, p_reason: reason });
}

export function useUndoToast() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries();
  return (message: string, auditId: string | null | undefined, description?: string) => {
    if (!auditId) {
      toast.success(message, { description });
      return;
    }
    toast.success(message, {
      description,
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          undoAudit(auditId).then(() => { toast.success('Undone'); refresh(); }).catch((e) => toast.error(toAppError(e).message));
        },
      },
    });
  };
}
