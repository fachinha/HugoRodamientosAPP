import { describe, it, expect } from 'vitest';
import { formatARS, parseMoneyToCents, centsToInput } from '../src/shared/money';
import { normalizeCode, isValidCode } from '../src/shared/barcode';
import { stockStatus, suggestReplenishment, replenishmentPriority } from '../src/shared/stock';
import { subtotal, discountFromPct, refundAmount } from '../src/shared/sales';

describe('Shared modules', () => {
  it('handles money formatting and parsing in ARS', () => {
    expect(parseMoneyToCents('1.250,50')).toBe(125050);
    expect(parseMoneyToCents('1250.50')).toBe(125050);
    expect(parseMoneyToCents('$ 500')).toBe(50000);
    expect(parseMoneyToCents(12.34)).toBe(1234);
    expect(centsToInput(125050)).toBe('1250,50');
    expect(formatARS(100000)).toContain('1.000');
  });

  it('normalizes barcodes while preserving leading zeros', () => {
    expect(normalizeCode('  0007791234567\r\n')).toBe('0007791234567');
    expect(isValidCode('0007791234567')).toBe(true);
    expect(isValidCode('')).toBe(false);
  });

  it('calculates stock status and replenishment correctly', () => {
    expect(stockStatus(0, 10)).toBe('out');
    expect(stockStatus(5, 10)).toBe('low');
    expect(stockStatus(10, 10)).toBe('low');
    expect(stockStatus(11, 10)).toBe('ok');
    expect(stockStatus(5, null)).toBe('no_min');

    // Replenishment
    const s1 = suggestReplenishment(3, 5, 15);
    expect(s1.quantity).toBe(12);
    expect(s1.basis).toBe('target');

    const s2 = suggestReplenishment(2, 5, null, 2);
    expect(s2.quantity).toBe(8); // 5*2 - 2 = 8
    expect(s2.basis).toBe('min_fallback');

    expect(replenishmentPriority('out')).toBe(1);
    expect(replenishmentPriority('low')).toBe(2);
    expect(replenishmentPriority('no_min')).toBe(3);
    expect(replenishmentPriority('ok')).toBe(null);
  });

  it('calculates sales totals, discounts and prorated refunds', () => {
    const lines = [
      { unitPriceCents: 10000, quantity: 2 }, // 20000
      { unitPriceCents: 5000, quantity: 1 },  // 5000
    ];
    expect(subtotal(lines)).toBe(25000);
    expect(discountFromPct(25000, 10)).toBe(2500);

    // Prorated refund on a sale with 10% discount:
    // Subtotal 25000, Total 22500. Return 1 item of 10000 -> 9000
    const ref = refundAmount({
      returnedLinesValueCents: 10000,
      saleSubtotalCents: 25000,
      saleTotalCents: 22500,
      alreadyRefundedCents: 0,
    });
    expect(ref).toBe(9000);
  });
});
