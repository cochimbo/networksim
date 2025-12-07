import { describe, it, expect } from 'vitest';

describe('App', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should verify environment', () => {
    expect(typeof window).toBe('object');
  });
});
