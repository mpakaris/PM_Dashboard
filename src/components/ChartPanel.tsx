'use client';

import { useTranslations } from 'next-intl';
import { chartsForPage } from '@/lib/chartRegistry';
import { useChartPrefs } from '@/lib/useChartPrefs';

interface Props {
  pageId: string;
  onClose: () => void;
}

export default function ChartPanel({ pageId, onClose }: Props) {
  const t = useTranslations('charts');
  const { prefs, setPref, resetToDefaults } = useChartPrefs(pageId);
  const charts = chartsForPage(pageId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative z-10 w-80 bg-white shadow-2xl flex flex-col h-full border-l border-gray-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">{t('panel')}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-gray-100">
            {charts.map(chart => {
              const pref = prefs[chart.id] ?? { visible: chart.defaultVisible, width: chart.defaultWidth };
              return (
                <div key={chart.id} className="px-5 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      {t(chart.titleKey as Parameters<typeof t>[0])}
                    </span>
                    <button
                      onClick={() => setPref(chart.id, { visible: !pref.visible })}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        pref.visible ? 'bg-slate-600' : 'bg-gray-200'
                      }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        pref.visible ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                  {pref.visible && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{t('half')}</span>
                      <button
                        onClick={() => setPref(chart.id, { width: 'half' })}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          pref.width === 'half'
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        ½
                      </button>
                      <button
                        onClick={() => setPref(chart.id, { width: 'full' })}
                        className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                          pref.width === 'full'
                            ? 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        ⬜
                      </button>
                      <span className="text-xs text-gray-400">{t('full')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-200">
          <button
            onClick={resetToDefaults}
            className="w-full text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:border-gray-300 rounded-md px-3 py-2 transition-colors"
          >
            {t('reset')}
          </button>
        </div>
      </div>
    </div>
  );
}
