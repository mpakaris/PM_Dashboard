'use client';

import { useState } from 'react';
import { OperationContract } from '@/lib/types';
import Modal from '@/components/Modal';

interface Props {
  initial?: OperationContract;
  months: string[];
  tasks?: string[];
  onSave: (c: OperationContract) => void;
  onClose: () => void;
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function getTicketId(task: string) {
  return task.match(/^(#\d+)/)?.[1] ?? '';
}

function getTicketLabel(task: string) {
  return task.replace(/^#\d+\s*-\s*/, '').trim() || task;
}

export default function OperationContractModal({ initial, months, tasks, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [defaultAmt, setDefaultAmt] = useState(String(initial?.defaultMonthlyAmount ?? ''));
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(initial?.monthlyOverrides ?? {}).map(([k, v]) => [k, String(v)]))
  );
  const [selectedTickets, setSelectedTickets] = useState<string[]>(initial?.ticketIds ?? []);

  function handleSave() {
    if (!name.trim()) return;
    const defaultMonthlyAmount = Math.max(0, Number(defaultAmt) || 0);
    const monthlyOverrides: Record<string, number> = {};
    for (const [month, val] of Object.entries(overrides)) {
      const n = Number(val);
      if (!isNaN(n) && val.trim() !== '' && n !== defaultMonthlyAmount) {
        monthlyOverrides[month] = n;
      }
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      defaultMonthlyAmount,
      monthlyOverrides,
      ticketIds: selectedTickets,
    });
  }

  function toggleTicket(task: string) {
    setSelectedTickets(prev =>
      prev.includes(task) ? prev.filter(t => t !== task) : [...prev, task]
    );
  }

  return (
    <Modal title={initial ? 'Edit Operation Contract' : 'Add Operation Contract'} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Contract Name</label>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Operation Contract 1"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Default Monthly Amount (€)</label>
          <input
            type="text"
            inputMode="numeric"
            value={defaultAmt}
            onChange={e => setDefaultAmt(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="e.g. 20000"
            className="w-40 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        {months.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Per-Month Overrides (leave blank to use default)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
              {months.map(month => (
                <div key={month} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-14 shrink-0">{fmtMonth(month)}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={overrides[month] ?? ''}
                    onChange={e => setOverrides(prev => ({ ...prev, [month]: e.target.value.replace(/[^0-9.]/g, '') }))}
                    placeholder={defaultAmt || '0'}
                    className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <span className="text-xs text-gray-400">€</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tasks && tasks.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">
              Assign Tickets ({selectedTickets.length} selected)
            </label>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {tasks.map(task => (
                <label key={task} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedTickets.includes(task)}
                    onChange={() => toggleTicket(task)}
                    className="text-indigo-600 rounded"
                  />
                  <span className="font-mono text-xs text-gray-400 shrink-0">{getTicketId(task)}</span>
                  <span className="text-xs text-gray-600 truncate">{getTicketLabel(task)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
