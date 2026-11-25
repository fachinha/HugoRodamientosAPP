import { describe, it, expect } from 'vitest';
import { formatARS, parseMoneyToCents, centsToInput } from '../src/shared/money';
import { normalizeCode, isValidCode } from '../src/shared/barcode';
import { stockStatus, suggestReplenishment, replenishmentPriority } from '../src/shared/stock';
import { subtotal, discountFromPct, refundAmount } from '../src/shared/sales';
import { parseSmartSearchQuery, matchTextSmart } from '../src/shared/smartSearch';

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

  it('matches multi-word queries in any order ignoring commas, spaces, hyphens and phonetic variants', () => {
    const pdfLine = 'Medidas 59x22 05012 CHEVROLET CORSA II 05/11 Motor 1.8 8v';
    expect(matchTextSmart(pdfLine, parseSmartSearchQuery('05012 Chevrolet corsa')).matched).toBe(true);
    expect(matchTextSmart(pdfLine, parseSmartSearchQuery('Chevrolet corsa 05012')).matched).toBe(true);
    expect(matchTextSmart(pdfLine, parseSmartSearchQuery('corsa, 05012, chevrolet')).matched).toBe(true);

    // Compound & multi-brand options ("dolzamg y skf" -> DOLZ | VMG | SKF)
    const parsedMultiBrand = parseSmartSearchQuery('bomba de agua dolzamg y skf');
    expect(parsedMultiBrand.brandOptionGroup).toEqual(['dolz', 'vmg', 'skf']);
    expect(matchTextSmart('Bomba de Agua Corsa O106 - DOLZ', parsedMultiBrand).matched).toBe(true);
    expect(matchTextSmart('BBA AGUA Corsa BA-193 - VMG', parsedMultiBrand).matched).toBe(true);
    expect(matchTextSmart('Bomba Agua VKPC 85206 - SKF', parsedMultiBrand).matched).toBe(true);

    // Phonetic variant "chivilcoi en alfa" -> CHIVILCOY + Alfa
    const parsedChiv = parseSmartSearchQuery('chivilcoi en alfa');
    expect(
      matchTextSmart('CH0119 CHIVILCOY BOMBA DE AGUA CORSA 1.6 · Alfa Rodamientos', parsedChiv).matched,
    ).toBe(true);

    // Compact code matching with/without spaces or hyphens
    expect(
      matchTextSmart('VKMA 05012 A - KIT DIST', parseSmartSearchQuery('VKMA05012')).matched,
    ).toBe(true);
  });
});
