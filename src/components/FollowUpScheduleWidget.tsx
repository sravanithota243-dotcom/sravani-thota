import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  Camera,
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import type { FollowUpReminder, LesionCase } from '../types';
import { api } from '../utils/api';

interface FollowUpScheduleWidgetProps {
  cases: LesionCase[];
  reminders: FollowUpReminder[];
  onReminderCreated: (reminder: FollowUpReminder) => void;
  onReminderUpdated: (reminder: FollowUpReminder) => void;
  onReminderDeleted: (reminderId: string) => void;
  onStartFollowUpScan: (caseId: string) => void;
}

function getLocalDateString(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCalendarDayDelta(dueDate: string, todayDate: string): number {
  const [dy, dm, dd] = dueDate.split('-').map(Number);
  const [ty, tm, td] = todayDate.split('-').map(Number);
  const dueMs = new Date(dy, dm - 1, dd).getTime();
  const todayMs = new Date(ty, tm - 1, td).getTime();
  return Math.round((dueMs - todayMs) / (24 * 60 * 60 * 1000));
}

type BrowserNotifyPermission = 'default' | 'granted' | 'denied' | 'unsupported';

function getBrowserNotifyPermission(): BrowserNotifyPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export function FollowUpScheduleWidget({
  cases,
  reminders,
  onReminderCreated,
  onReminderUpdated,
  onReminderDeleted,
  onStartFollowUpScan,
}: FollowUpScheduleWidgetProps) {
  const todayDate = getLocalDateString(0);

  const [selectedCaseId, setSelectedCaseId] = useState<string>(cases[0]?.id || '');
  const [dueDate, setDueDate] = useState<string>(getLocalDateString(7));
  const [note, setNote] = useState<string>('');
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(true);
  const [taskFilter, setTaskFilter] = useState<'upcoming' | 'completed' | 'all'>('upcoming');

  const [isCreating, setIsCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notifyPermission, setNotifyPermission] = useState<BrowserNotifyPermission>(
    getBrowserNotifyPermission
  );
  const [notifyBannerDismissed, setNotifyBannerDismissed] = useState(false);

  useEffect(() => {
    if (cases.length > 0 && !cases.some((c) => c.id === selectedCaseId)) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  const dueOrOverdueTasks = useMemo(() => {
    return reminders.filter((r) => !r.completed && r.dueDate <= todayDate);
  }, [reminders, todayDate]);

  useEffect(() => {
    if (notifyPermission !== 'granted') return;
    const alertable = dueOrOverdueTasks.filter((r) => r.notifyEnabled);
    if (alertable.length === 0) return;

    const sessionKey = `skinsense_notified_${todayDate}`;
    try {
      const alreadySent = sessionStorage.getItem(sessionKey);
      const signature = alertable.map((r) => r.id).sort().join(',');
      if (alreadySent === signature) return;

      const first = alertable[0];
      const title =
        alertable.length === 1
          ? `SkinSense Follow-Up Due: ${first.caseTitle}`
          : `SkinSense: ${alertable.length} Lesion Follow-Ups Due`;
      const body =
        alertable.length === 1
          ? `${first.bodyLocation} · Due ${first.dueDate}${first.note ? ` — ${first.note}` : ''}`
          : `Next checkup: ${first.caseTitle} (${first.bodyLocation}) due ${first.dueDate}.`;

      new window.Notification(title, { body });
      sessionStorage.setItem(sessionKey, signature);
    } catch {
      // Ignore sandboxed iframe Notification constructor restrictions
    }
  }, [dueOrOverdueTasks, notifyPermission, todayDate]);

  const handleRequestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotifyPermission('unsupported');
      return;
    }
    try {
      const result = await window.Notification.requestPermission();
      setNotifyPermission(result);
    } catch {
      setNotifyPermission('denied');
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCaseId) {
      setErrorMsg('Create or select a tracked lesion case before scheduling a follow-up.');
      return;
    }
    if (!dueDate) {
      setErrorMsg('Please select a follow-up date.');
      return;
    }

    setIsCreating(true);
    setErrorMsg(null);
    try {
      if (notifyEnabled && notifyPermission === 'default') {
        await handleRequestBrowserPermission();
      }
      const { reminder } = await api.createReminder({
        caseId: selectedCaseId,
        dueDate,
        note,
        notifyEnabled,
      });
      onReminderCreated(reminder);
      setNote('');
      setTaskFilter('upcoming');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to schedule follow-up.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleCompleted = async (reminder: FollowUpReminder) => {
    setBusyId(reminder.id);
    setErrorMsg(null);
    try {
      const { reminder: updated } = await api.updateReminder(reminder.id, {
        completed: !reminder.completed,
      });
      onReminderUpdated(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update task status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleNotify = async (reminder: FollowUpReminder) => {
    setBusyId(reminder.id);
    setErrorMsg(null);
    try {
      if (!reminder.notifyEnabled && notifyPermission === 'default') {
        await handleRequestBrowserPermission();
      }
      const { reminder: updated } = await api.updateReminder(reminder.id, {
        notifyEnabled: !reminder.notifyEnabled,
      });
      onReminderUpdated(updated);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update notification preference.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReminder = async (reminderId: string) => {
    setBusyId(reminderId);
    setErrorMsg(null);
    try {
      await api.deleteReminder(reminderId);
      onReminderDeleted(reminderId);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to delete task.');
    } finally {
      setBusyId(null);
    }
  };

  const upcomingCount = reminders.filter((r) => !r.completed).length;
  const completedCount = reminders.filter((r) => r.completed).length;

  const visibleReminders = useMemo(() => {
    const filtered =
      taskFilter === 'upcoming'
        ? reminders.filter((r) => !r.completed)
        : taskFilter === 'completed'
          ? reminders.filter((r) => r.completed)
          : reminders;
    return [...filtered].sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [reminders, taskFilter]);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">
              Follow-Up Scheduling &amp; Upcoming Tasks
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Schedule longitudinal lesion re-checks and receive due-date notifications for upcoming screenings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono text-slate-600 tabular-nums">
            {upcomingCount} Upcoming · {completedCount} Completed
          </span>
          {notifyPermission === 'default' && (
            <button
              type="button"
              onClick={() => void handleRequestBrowserPermission()}
              className="px-3 py-1.5 font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Enable Browser Alerts</span>
            </button>
          )}
          {notifyPermission === 'granted' && (
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium whitespace-nowrap">
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Browser Alerts Active</span>
            </span>
          )}
          {notifyPermission === 'denied' && (
            <span className="flex items-center gap-1.5 text-slate-500 whitespace-nowrap">
              <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Browser Alerts Blocked (In-App Active)</span>
            </span>
          )}
        </div>
      </div>

      {/* In-App Notification Banner for Due / Overdue Tasks */}
      {dueOrOverdueTasks.length > 0 && !notifyBannerDismissed && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <BellRing className="w-4 h-4 text-amber-700 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="text-xs text-amber-950 space-y-0.5">
              <div className="font-semibold">
                {dueOrOverdueTasks.length} Follow-Up Screening{dueOrOverdueTasks.length === 1 ? '' : 's'} Due
              </div>
              <div className="text-amber-900">
                Next: <span className="font-semibold">{dueOrOverdueTasks[0].caseTitle}</span> (
                {dueOrOverdueTasks[0].bodyLocation}) · Scheduled{' '}
                <span className="font-mono tabular-nums">{dueOrOverdueTasks[0].dueDate}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onStartFollowUpScan(dueOrOverdueTasks[0].caseId)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Capture Scan Now</span>
            </button>
            <button
              type="button"
              onClick={() => setNotifyBannerDismissed(true)}
              className="px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 rounded-md cursor-pointer whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-700" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Split Layout: Left Scheduling Form, Right Upcoming Tasks Widget */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left: Schedule New Follow-Up */}
        <form
          onSubmit={handleScheduleSubmit}
          className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3.5"
        >
          <div className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
            Schedule New Checkup
          </div>

          <div className="space-y-1">
            <label htmlFor="followup-case" className="block text-xs font-medium text-slate-700">
              Tracked Lesion Case
            </label>
            <select
              id="followup-case"
              value={selectedCaseId}
              onChange={(e) => setSelectedCaseId(e.target.value)}
              disabled={cases.length === 0}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-50"
            >
              {cases.length === 0 ? (
                <option value="">No lesion cases available yet</option>
              ) : (
                cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.bodyLocation})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="followup-date" className="block text-xs font-medium text-slate-700">
                Follow-Up Date
              </label>
              <div className="flex items-center gap-1.5">
                {[3, 7, 14, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setDueDate(getLocalDateString(days))}
                    className="px-1.5 py-0.5 text-[11px] font-mono text-teal-800 bg-white border border-slate-300 hover:bg-teal-50 rounded cursor-pointer"
                  >
                    +{days}d
                  </button>
                ))}
              </div>
            </div>
            <input
              id="followup-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="followup-note" className="block text-xs font-medium text-slate-700">
              Checkup Note (Optional)
            </label>
            <input
              id="followup-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={400}
              placeholder="e.g., Re-capture border & pigmentation with millimeter scale"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyEnabled}
              onChange={(e) => setNotifyEnabled(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Enable reminder notification on due date</span>
          </label>

          <button
            type="submit"
            disabled={isCreating || cases.length === 0}
            className="w-full px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Scheduling...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Schedule Follow-Up</span>
              </>
            )}
          </button>
        </form>

        {/* Right: Upcoming Tasks Widget */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
              Upcoming Tasks Queue
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'upcoming', label: 'Upcoming', count: upcomingCount },
                  { id: 'completed', label: 'Completed', count: completedCount },
                  { id: 'all', label: 'All', count: reminders.length },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTaskFilter(tab.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    taskFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {visibleReminders.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-300 rounded-lg text-center text-xs text-slate-500">
              {taskFilter === 'upcoming'
                ? 'No upcoming lesion follow-ups scheduled. Use the form on the left to set a target date.'
                : taskFilter === 'completed'
                  ? 'No completed follow-up tasks yet.'
                  : 'No follow-up tasks scheduled yet.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg max-h-[340px] overflow-y-auto">
              {visibleReminders.map((task) => {
                const deltaDays = getCalendarDayDelta(task.dueDate, todayDate);
                const isBusy = busyId === task.id;

                let statusNode: React.ReactNode;
                if (task.completed) {
                  statusNode = (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Completed</span>
                    </span>
                  );
                } else if (deltaDays < 0) {
                  statusNode = (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Overdue · {Math.abs(deltaDays)}d</span>
                    </span>
                  );
                } else if (deltaDays === 0) {
                  statusNode = (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                      <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Due Today</span>
                    </span>
                  );
                } else if (deltaDays === 1) {
                  statusNode = (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Tomorrow</span>
                    </span>
                  );
                } else {
                  statusNode = (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-teal-700">
                      <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>In {deltaDays} days</span>
                    </span>
                  );
                }

                return (
                  <div
                    key={task.id}
                    className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      task.completed ? 'bg-slate-50/70' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleCompleted(task)}
                        disabled={isBusy}
                        aria-label={
                          task.completed ? 'Reopen follow-up task' : 'Mark follow-up task complete'
                        }
                        className="mt-0.5 text-slate-500 hover:text-teal-700 cursor-pointer disabled:opacity-40 shrink-0"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                        ) : (
                          <Circle className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span
                            className={`font-semibold ${
                              task.completed ? 'line-through text-slate-500' : 'text-slate-900'
                            }`}
                          >
                            {task.caseTitle}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-slate-600">{task.bodyLocation}</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                          <span className="font-mono text-slate-700 tabular-nums">
                            {task.dueDate}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">
                            |
                          </span>
                          {statusNode}
                        </div>

                        {task.note && (
                          <p className="text-xs text-slate-600 leading-relaxed">{task.note}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pl-7 sm:pl-0">
                      <button
                        type="button"
                        onClick={() => void handleToggleNotify(task)}
                        disabled={isBusy}
                        title={
                          task.notifyEnabled
                            ? 'Due-date alert enabled (click to mute)'
                            : 'Due-date alert muted (click to enable)'
                        }
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer disabled:opacity-40"
                      >
                        {task.notifyEnabled ? (
                          <Bell className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                        ) : (
                          <BellOff className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        )}
                      </button>

                      {!task.completed && (
                        <button
                          type="button"
                          onClick={() => onStartFollowUpScan(task.caseId)}
                          className="px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Scan</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void handleDeleteReminder(task.id)}
                        disabled={isBusy}
                        aria-label="Delete follow-up task"
                        className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
