import { describe, expect, it } from 'vitest';
import { counterText, photoLabel, swipeStep, wrapIndex } from './lightbox';

describe('lightbox helpers', () => {
  it('wraps both ways', () => {
    expect(wrapIndex(24, 24)).toBe(0);
    expect(wrapIndex(-1, 24)).toBe(23);
    expect(wrapIndex(3, 0)).toBe(0);
  });
  it('reads a swipe only when long and mostly sideways', () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
    expect(swipeStep(-20, 0)).toBe(0);
    expect(swipeStep(-80, 70)).toBe(0);
  });
  it('formats the counter', () => {
    expect(counterText(2, 24)).toBe('3 / 24');
    expect(counterText(0, 0)).toBe('1 / 0');
  });
  it('turns file names into labels', () => {
    expect(photoLabel('afterclean_2026-09-28T10-12-00.jpg')).toBe('Afterclean');
    expect(photoLabel('kitchen_1759000000000_ab.jpg')).toBe('Kitchen');
    expect(photoLabel('Bathroom (2).png')).toBe('Bathroom');
    expect(photoLabel('2026-09-28.jpg')).toBe('2026-09-28.jpg');
  });
});
