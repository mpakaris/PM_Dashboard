'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useRole } from '@/components/RoleProvider';
import { ForecastProject, OperationContract } from '@/lib/types';
import { getMonthsBetween, formatMonth } from '@/lib/utils';
import { opAmount, totalOpsIncome } from '@/lib/operationsUtils';
import { fmtEur, type Locale } from '@/lib/i18n';
import OperationContractModal from '@/components/OperationContractModal';
import { updateForecastProjectOperations } from '@/actions/forecasts';

interface Props {
  project: ForecastProject;
  forecastId: string;
  onRefresh: () => void;
}

export default function ProjectOperationsSection({ project, forecastId, onRefresh }: Props) {
  const t = useTranslations('operations');
  const tCommon = useTranslations('common');
  const locale = useLocale() as Locale;
  const isAdmin = useRole() === 'admin';
  const router = useRouter();
  const months = getMonthsBetween(project.startMonth, project.endMonth);
  const [contracts, setContracts] = useState<OperationContract[]>(project.operationContracts ?? []);
  const [editingContract, setEditingContract] = useState<OperationContract | null | 'new'>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setContracts(project.operationContracts ?? []);
  }, [project.operationContracts]);

  function toggleExpand(id: string) {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function handleSaveContract(c: OperationContract) {
    const next = editingContract === 'new'
      ? [...contracts, c]
      : contracts.map(x => x.id === c.id ? c : x);
    setContracts(next);
    setEditingContract(null);
    await updateForecastProjectOperations(forecastId, project.id, next);
    router.refresh();
    onRefresh();
  }

  async function handleDelete(id: string) {
    const next = contracts.filter(c => c.id !== id);
    setContracts(next);
    await updateForecastProjectOperations(forecastId, project.id, next);
    router.refresh();
    onRefresh();
  }

  const totalIncome = totalOpsIncome(contracts, months);

  return (
    <div className="border-t border-gray-100">
      {editingContract !== null && (
        <OperationContractModal
          initial={editingContract === 'new' ? undefined : editingContract}
          months={months}
          onSave={handleSaveContract}
          onClose={() => setEditingContract(null)}
        />
      )}

      <div className="px-5 py-3 bg-indigo-50/40">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">{t('title')}</span>
            {totalIncome > 0 && (
              <span className="text-xs font-semibold text-indigo-600">{fmtEur(totalIncome, locale)} {t('totalLabel')}</span>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setEditingContract('new')}
              className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 rounded px-2.5 py-1 transition-colors"
            >
              {t('addContract')}
            </button>
          )}
        </div>

        {contracts.length === 0 ? (
          <p className="text-xs text-indigo-400">
            {isAdmin ? t('noContractsAdmin') : t('noContracts')}
          </p>
        ) : (
          <div className="space-y-1">
            {contracts.map(c => {
              const contractTotal = months.reduce((s, m) => s + opAmount(c, m), 0);
              const isExpanded = expandedIds.has(c.id);
              return (
                <div key={c.id} className="bg-white rounded-md border border-indigo-100 overflow-hidden">
                  <div
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-indigo-50/50"
                    onClick={() => toggleExpand(c.id)}
                  >
                    <span className={`text-indigo-300 text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <span className="text-xs font-medium text-gray-700 flex-1">{c.name}</span>
                    <span className="text-xs text-indigo-500">{fmtEur(c.defaultMonthlyAmount, locale)}{t('perMonthDefault')}</span>
                    <span className="text-xs font-semibold text-indigo-700 ml-2">{fmtEur(contractTotal, locale)} {t('totalLabel')}</span>
                    {isAdmin && (
                      <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => setEditingContract(c)}
                          className="text-xs text-gray-400 hover:text-slate-600 px-1.5 py-0.5 border border-transparent hover:border-gray-200 rounded transition-colors"
                        >
                          {tCommon('edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="text-xs text-gray-300 hover:text-red-400 px-1 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                  {isExpanded && months.length > 0 && (
                    <div className="border-t border-indigo-100 overflow-x-auto">
                      <table className="text-xs w-full min-w-max">
                        <thead>
                          <tr className="bg-indigo-50/50">
                            {months.map(m => (
                              <th key={m} className="text-right px-3 py-1.5 font-medium text-indigo-500">{formatMonth(m)}</th>
                            ))}
                            <th className="text-right px-3 py-1.5 font-medium text-indigo-700">{tCommon('total')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            {months.map(m => (
                              <td key={m} className={`text-right px-3 py-1.5 ${c.monthlyOverrides[m] !== undefined ? 'text-indigo-600 font-medium' : 'text-gray-600'}`}>
                                {fmtEur(opAmount(c, m), locale)}
                              </td>
                            ))}
                            <td className="text-right px-3 py-1.5 font-bold text-indigo-700">{fmtEur(contractTotal, locale)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {contracts.length > 1 && months.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="text-xs w-full min-w-max">
              <thead>
                <tr>
                  <td className="px-0 py-1 text-xs font-semibold text-indigo-700">{t('totalOpsIncome')}</td>
                  {months.map(m => (
                    <td key={m} className="text-right px-3 py-1 font-semibold text-indigo-700">
                      {fmtEur(contracts.reduce((s, c) => s + opAmount(c, m), 0), locale)}
                    </td>
                  ))}
                  <td className="text-right px-3 py-1 font-bold text-indigo-700">{fmtEur(totalIncome, locale)}</td>
                </tr>
              </thead>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
