import type { ChartController } from './controller';

export const controllers = new Map<string, ChartController>();

type CrossFn = (from: string, time: number | null) => void;
const crossSubs = new Set<CrossFn>();
export const crosshairBus = {
  emit(from: string, time: number | null) { crossSubs.forEach((f) => f(from, time)); },
  on(fn: CrossFn) { crossSubs.add(fn); return () => { crossSubs.delete(fn); }; },
};
