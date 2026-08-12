'use client';

import { useState } from 'react';
import { OperationContract } from '@/lib/types';
import { opAmount, totalOpsIncome } from '@/lib/operationsUtils';
import OperationContractModal from '@/components/OperationContractModal';
import { ticketId, ticketLabel } from './ProjektAnalysisCharts';

interface Props {
  contracts: OperationContract[];
  months: string[];
  tasks: string[];
  isAdmin: boolean;
  onSave: (next: OperationContract[]) => Promise<void>;
}

function fmtEur(v: number) {
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

export default function OperationsTab({ contracts, months, tasks, isAdmin, onSave }: Props) {
  const [editingContract, setEditingContract] = useState<OperationContract | null | 'new'>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function handleSaveContract(c: OperationContract) {
    const next = editingContract === 'new'
      ? [...contracts, c]
      : contracts.map(x => x.id === c.id ? c : x);
    setEditingContract(null);
    await onSave(next);
  }

  async function handleDelete(id: string) {
    await onSave(contracts.filter(c => c.id !== id));
  }

  const totalIncome = totalOpsIncome(contracts, months);

  return (
    <div className="space-y-4">
      {editingContract !== null && (
        <OperationContractModal
          initial={editingContract === 'new' ? undefined : editingContract}
          months={months}
          tasks={tasks}
          onSave={handleSaveContract}
          onClose={() => setEditingContract(null)}
        />
      )}

      <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Operation Contracts</h3>
            {totalIncome > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                Total income ({months.length} months): <span className="font-semibold text-indigo-700">{fmtEur(totalIncome)}</span>
              </p>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setEditingContract('new')}
              className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 rounded-md px-3 py-1.5 transition-colors"
            >
              + Add Contract
            </button>
          )}
        </div>

        {contracts.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No operation contracts yet.{isAdmin ? ' Click "+ Add Contract" to create one.' : ''}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {contracts.map(c => {
              const contractTotal = months.reduce((s, m) => s + opAmount(c, m), 0);
              const isExpanded = expandedIds.has(c.id);
              return (
                <div key={c.id}>
                  <div
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleExpand(c.id)}
                  >
                    <span className={`text-gray-300 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-800">{c.name}</span>
                      <span className="ml-3 text-xs text-gray-400">
                        {fmtEur(c.defaultMonthlyAmount)}/mo default
                        {Object.keys(c.monthlyOverrides).length > 0 && ` · ${Object.keys(c.monthlyOverrides).length} override(s)`}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold text-indigo-700">{fmtEur(contractTotal)}</span>
                      <span className="text-xs text-gray-400 ml-1">total</span>
                    </div>
                    <div className="text-xs text-gray-400 shrink-0">
                      {c.ticketIds.length} ticket{c.ticketIds.length !== 1 ? 's' : ''}
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingContract(c)}
                          className="text-xs text-gray-400 hover:text-slate-600 px-2 py-1 border border-transparent hover:border-gray-200 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-xs text-gray-300 hover:text-red-400 px-1.5 py-1 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="bg-gray-50/60 border-t border-gray-100 px-5 py-4 space-y-4">
                      {months.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Monthly Income</p>
                          <div className="overflow-x-auto">
                            <table className="text-xs w-full">
                              <thead>
                                <tr className="text-gray-400">
                                  {months.map(m => (
                                    <th key={m} className="text-right pr-3 py-1 font-medium">{fmtMonth(m)}</th>
                                  ))}
                                  <th className="text-right py-1 font-medium">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  {months.map(m => (
                                    <td key={m} className={`text-right pr-3 py-1.5 font-medium ${c.monthlyOverrides[m] !== undefined ? 'text-indigo-600' : 'text-gray-700'}`}>
                                      {fmtEur(opAmount(c, m))}
                                    </td>
                                  ))}
                                  <td className="text-right py-1.5 font-bold text-indigo-700">{fmtEur(contractTotal)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {c.ticketIds.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Assigned Tickets</p>
                          <div className="flex flex-wrap gap-1.5">
                            {c.ticketIds.map(task => (
                              <span key={task} className="flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2.5 py-0.5">
                                {ticketId(task)} {ticketLabel(task)}
                                {isAdmin && (
                                  <button
                                    onClick={async () => {
                                      const next = contracts.map(x => x.id === c.id
                                        ? { ...x, ticketIds: x.ticketIds.filter(t => t !== task) }
                                        : x
                                      );
                                      await onSave(next);
                                    }}
                                    className="text-indigo-300 hover:text-red-500 transition-colors ml-0.5 leading-none"
                                    title="Remove ticket from this contract"
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {contracts.length > 0 && months.length > 0 && (
        <div className="bg-white rounded-lg ring-1 ring-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">Monthly Operations Income Overview</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2 font-medium text-gray-500">Contract</th>
                  {months.map(m => (
                    <th key={m} className="text-right px-3 py-2 font-medium text-gray-500">{fmtMonth(m)}</th>
                  ))}
                  <th className="text-right px-5 py-2 font-medium text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contracts.map(c => (
                  <tr key={c.id}>
                    <td className="px-5 py-2 text-gray-700 font-medium">{c.name}</td>
                    {months.map(m => (
                      <td key={m} className="text-right px-3 py-2 text-gray-600">{fmtEur(opAmount(c, m))}</td>
                    ))}
                    <td className="text-right px-5 py-2 font-semibold text-gray-800">
                      {fmtEur(months.reduce((s, m) => s + opAmount(c, m), 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-indigo-50/50">
                <tr className="font-bold text-indigo-700">
                  <td className="px-5 py-2">Total Ops Income</td>
                  {months.map(m => (
                    <td key={m} className="text-right px-3 py-2">
                      {fmtEur(contracts.reduce((s, c) => s + opAmount(c, m), 0))}
                    </td>
                  ))}
                  <td className="text-right px-5 py-2">{fmtEur(totalIncome)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
