import { describe, expect, it } from 'vitest';
import { isConsumptionReading } from './api';

// The August 2026 outlier: a duplicate session entered with previous values of
// 0, and a re-entry with negative deltas. Neither is consumption.
describe('isConsumptionReading', () => {
  it('accepts a normal continuation reading', () => {
    expect(isConsumptionReading({ electric_prev: '3558', water_prev: '67.388', electric_delta: '56', water_delta: '1.439', meter_flag: null })).toBe(true);
  });
  it('rejects a first reading with previous 0', () => {
    expect(isConsumptionReading({ electric_prev: '0', water_prev: '0', electric_delta: '3558', water_delta: '67.388', meter_flag: null })).toBe(false);
  });
  it('rejects a negative re-entry', () => {
    expect(isConsumptionReading({ electric_prev: '3558', water_prev: '67.388', electric_delta: '-36', water_delta: '-0.99', meter_flag: null })).toBe(false);
  });
  it('rejects a flagged reading', () => {
    expect(isConsumptionReading({ electric_prev: '3558', water_prev: '67.388', electric_delta: '10', water_delta: '0.2', meter_flag: 'suspect' })).toBe(false);
  });
});
