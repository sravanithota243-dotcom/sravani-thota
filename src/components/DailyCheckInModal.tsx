import { CalendarCheck, Check, Plus, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import type { CheckInLesionStatus, DailyCheckInTask, LesionCase, UserProfile } from '../types';

interface DailyCheckInModalProps {
  isOpen: boolean;
  user: UserProfile;
  cases: LesionCase[];
  todayDate: string;
  onLogTask: (task: DailyCheckInTask) => void;
  onNoChangesToday: () => void;
  onDismiss: () => void;
}

export function DailyCheckInModal({
  isOpen,
  user,
  cases,
  todayDate,
  onLogTask,
  onNoChangesToday,
  onDismiss,
}: DailyCheckInModalProps) {
  const [lesionStatus, setLesionStatus] = useState<CheckInLesionStatus>('new');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(cases[0]?.id || 'other');
  const [title, setTitle] = useState('');
  const [bodyLocation, setBodyLocation] = useState('');
  const [observedChange, setObservedChange] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    if (cases.length > 0 && selectedCaseId === 'other') {
      setSelectedCaseId(cases[0].id);
    }
  }, [isOpen, cases, selectedCaseId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  const matchedCase =
    lesionStatus === 'changed' && selectedCaseId !== 'other'
      ? cases.find((c) => c.id === selectedCaseId) || null
      : null;

  const handleModeChange = (nextStatus: CheckInLesionStatus) => {
    setLesionStatus(nextStatus);
    setErrorMsg(null);
    if (nextStatus === 'changed' && cases.length > 0) {
      const target = cases.find((c) => c.id === selectedCaseId) || cases[0];
      setSelectedCaseId(target.id);
      setTitle(target.title);
      setBodyLocation(target.bodyLocation);
    } else if (nextStatus === 'new') {
      setTitle('');
      setBodyLocation('');
    }
  };

  const handleCaseSelect = (caseId: string) => {
    setSelectedCaseId(caseId);
    const target = cases.find((c) => c.id === caseId);
    if (target) {
      setTitle(target.title);
      setBodyLocation(target.bodyLocation);
    } else {
      setTitle('');
      setBodyLocation('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedTitle = (matchedCase ? title.trim() || matchedCase.title : title.trim());
    const resolvedLocation = (
      matchedCase ? bodyLocation.trim() || matchedCase.bodyLocation : bodyLocation.trim()
    );
    const resolvedChange = observedChange.trim();

    if (!resolvedTitle) {
      setErrorMsg('Please enter a lesion or spot label.');
      return;
    }
    if (!resolvedLocation) {
      setErrorMsg('Please enter the body location.');
      return;
    }

    const newTask: DailyCheckInTask = {
      id: `checkin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user.id,
      checkInDate: todayDate,
      lesionStatus,
      title: resolvedTitle,
      bodyLocation: resolvedLocation,
      observedChange:
        resolvedChange ||
        (lesionStatus === 'new'
          ? 'Newly noticed spot logged during daily skin health check-in.'
          : 'Change noticed in existing lesion during daily check-in.'),
      caseId: matchedCase?.id,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    onLogTask(newTask);
    setTitle('');
    setBodyLocation('');
    setObservedChange('');
    setErrorMsg(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-checkin-title"
        className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <CalendarCheck className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="daily-checkin-title" className="text-lg font-bold text-slate-900">
                Daily Skin Health Check-in
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {todayDate} · Log any new or changed lesions as a temporary task in your History dashboard.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close Daily Skin Health Check-in"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-1.5">
              What did you notice today?
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => handleModeChange('new')}
                aria-pressed={lesionStatus === 'new'}
                className={`py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  lesionStatus === 'new'
                    ? 'bg-white text-teal-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                New Spot / Lesion
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('changed')}
                aria-pressed={lesionStatus === 'changed'}
                className={`py-2 px-3 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  lesionStatus === 'changed'
                    ? 'bg-white text-teal-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Changed Existing Lesion
              </button>
            </div>
          </div>

          {lesionStatus === 'changed' && cases.length > 0 && (
            <div>
              <label htmlFor="checkin-existing-case" className="block text-xs font-semibold text-slate-700 mb-1">
                Select Tracked Lesion Case
              </label>
              <select
                id="checkin-existing-case"
                value={selectedCaseId}
                onChange={(e) => handleCaseSelect(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.bodyLocation})
                  </option>
                ))}
                <option value="other">Other / Untracked Lesion</option>
              </select>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="checkin-lesion-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Lesion / Spot Name
              </label>
              <input
                id="checkin-lesion-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Right Calf Spot"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="checkin-body-location" className="block text-xs font-semibold text-slate-700 mb-1">
                Body Location
              </label>
              <input
                id="checkin-body-location"
                type="text"
                value={bodyLocation}
                onChange={(e) => setBodyLocation(e.target.value)}
                placeholder="e.g., Right Lower Leg"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="checkin-observed-change" className="block text-xs font-semibold text-slate-700 mb-1">
              Observed Changes or Symptoms
            </label>
            <textarea
              id="checkin-observed-change"
              rows={2}
              value={observedChange}
              onChange={(e) => setObservedChange(e.target.value)}
              placeholder="e.g., Darker border, slight itching, or noticeable growth since last week"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {errorMsg && (
            <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onNoChangesToday}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
              <span>No Changes Today</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                Skip
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Add Temporary Task</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
