-- Migración 0006: Detalle de tarjetas (Débito / Crédito y Marca Visa / Mastercard / etc.) en ventas POS
ALTER TABLE sales ADD COLUMN card_type TEXT CHECK (card_type IS NULL OR card_type IN ('debito', 'credito'));
ALTER TABLE sales ADD COLUMN card_brand TEXT CHECK (card_brand IS NULL OR length(card_brand) <= 40);
