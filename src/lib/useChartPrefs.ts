'use client';

import { useState, useEffect, useCallback } from 'react';
import { CHART_REGISTRY, chartsForPage } from './chartRegistry';

export type ChartPrefs = Record<string, { visible: boolean; width: 'half' | 'full' }>;

function storageKey(pageId: string) {
  return `chartPrefs:${pageId}`;
}

function defaultPrefs(pageId: string): ChartPrefs {
  const prefs: ChartPrefs = {};
  for (const c of chartsForPage(pageId)) {
    prefs[c.id] = { visible: c.defaultVisible, width: c.defaultWidth };
  }
  return prefs;
}

export function useChartPrefs(pageId: string) {
  const [prefs, setPrefs] = useState<ChartPrefs>(() => defaultPrefs(pageId));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(pageId));
      if (raw) {
        const saved = JSON.parse(raw) as ChartPrefs;
        // Merge saved prefs with defaults so new charts appear with defaults
        setPrefs({ ...defaultPrefs(pageId), ...saved });
      }
    } catch {
      // ignore parse errors
    }
  }, [pageId]);

  const setPref = useCallback((id: string, patch: Partial<{ visible: boolean; width: 'half' | 'full' }>) => {
    setPrefs(prev => {
      const next = { ...prev, [id]: { ...(prev[id] ?? { visible: true, width: 'half' as const }), ...patch } };
      try { localStorage.setItem(storageKey(pageId), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [pageId]);

  const resetToDefaults = useCallback(() => {
    const defaults = defaultPrefs(pageId);
    setPrefs(defaults);
    try { localStorage.removeItem(storageKey(pageId)); } catch {}
  }, [pageId]);

  return { prefs, setPref, resetToDefaults };
}
