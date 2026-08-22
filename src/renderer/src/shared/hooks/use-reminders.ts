import { listReminders, getActiveReminderCount, dismissReminder, completeReminder } from '@shared/api'
import type { ReminderListItem, ReminderListFilters, ActiveReminderCount } from '@shared/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Query Key Factory
// ---------------------------------------------------------------------------

const reminderKeys = {
  all: (companyId: number) => [companyId, 'reminders'] as const,
  lists: (companyId: number) => [...reminderKeys.all(companyId), 'list'] as const,
  list: (companyId: number, filters: ReminderListFilters) => [...reminderKeys.lists(companyId), filters] as const,
  count: (companyId: number) => [...reminderKeys.all(companyId), 'count'] as const
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a paginated list of reminders for the given company,
 * supporting filtering by status and entity type.
 */
function useReminders(companyId: number, filters: ReminderListFilters) {
  return useQuery({
    queryKey: reminderKeys.list(companyId, filters),
    queryFn: () => listReminders(companyId, filters)
  })
}

/**
 * Fetches the count of active reminders for badge display.
 */
function useActiveReminderCount(companyId: number) {
  return useQuery({
    queryKey: reminderKeys.count(companyId),
    queryFn: () => getActiveReminderCount(companyId)
  })
}

/**
 * Mutation to dismiss an active reminder.
 * Invalidates the reminders list and count on success.
 */
function useDismissReminder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => dismissReminder(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all(companyId) })
    }
  })
}

/**
 * Mutation to mark a reminder as completed.
 * Invalidates the reminders list and count on success.
 */
function useCompleteReminder(companyId: number) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => completeReminder(companyId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reminderKeys.all(companyId) })
    }
  })
}

export { reminderKeys, useReminders, useActiveReminderCount, useDismissReminder, useCompleteReminder }
export type { ReminderListItem, ReminderListFilters, ActiveReminderCount }
