import { useState, useEffect, useRef } from 'react';

/**
 * Safely evaluate a basic arithmetic expression.
 * Supports: + - * / x X × and parentheses.
 * Returns null if the expression is invalid or result is non-finite.
 */
function evalMath(expr: string): number | null {
  // Normalise: x/X/× → *, strip commas/spaces
  const normalized = expr.replace(/[xX×]/g, '*').replace(/,/g, '').trim();
  if (!normalized) return null;
  // Whitelist: digits, operators, parentheses, decimal point, whitespace only
  if (!/^[\d\s+\-*/.()\t]+$/.test(normalized)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${normalized})`)() as unknown;
    if (typeof result !== 'number' || !isFinite(result)) return null;
    // Round to 3 decimal places to avoid floating-point noise
    return Math.round(result * 1000) / 1000;
  } catch {
    return null;
  }
}

/**
 * Returns true when the string contains an arithmetic operator
 * (not just a leading minus sign on a plain negative number).
 */
function hasMathOp(s: string): boolean {
  return /[+*/xX×]/.test(s) || /\d-/.test(s);
}

type InputHTMLProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'>;

interface MathInputProps extends InputHTMLProps {
  value: string;
  onChange: (e: { target: { value: string } }) => void;
}

/**
 * Drop-in replacement for `<input type="number">` that evaluates arithmetic
 * expressions (e.g. "6*57000", "100+50", "1000000/4") on blur or Enter/Tab.
 * Shows a live "= N" preview while typing.
 */
export function MathInput({ value, onChange, className, ...rest }: MathInputProps) {
  const [raw, setRaw] = useState(value);
  const [preview, setPreview] = useState<number | null>(null);
  const lastReported = useRef(value);

  // Sync when the parent resets the field (e.g. form clear after submit)
  useEffect(() => {
    if (value !== lastReported.current) {
      setRaw(value);
      setPreview(null);
      lastReported.current = value;
    }
  }, [value]);

  /** Evaluate `expr` and flush the result to parent state. */
  const commit = (expr: string) => {
    if (hasMathOp(expr)) {
      const result = evalMath(expr);
      if (result !== null) {
        const str = String(result);
        setRaw(str);
        setPreview(null);
        lastReported.current = str;
        onChange({ target: { value: str } });
        return;
      }
    }
    setPreview(null);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setRaw(v);
    if (hasMathOp(v)) {
      setPreview(evalMath(v));
    } else {
      setPreview(null);
      lastReported.current = v;
      onChange({ target: { value: v } });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === 'Tab') && hasMathOp(raw)) {
      // Don't prevent Tab's normal focus movement — we'll commit and let it propagate
      commit(raw);
    }
  };

  const handleBlur = () => commit(raw);

  const showPreview = preview !== null && hasMathOp(raw);

  return (
    <div className={`relative ${className ?? ''}`}>
      <input
        {...rest}
        type="text"
        inputMode="decimal"
        value={raw}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={showPreview ? { paddingRight: '4.5rem' } : undefined}
      />
      {showPreview && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-emerald-400 pointer-events-none font-mono select-none">
          ={preview.toLocaleString()}
        </span>
      )}
    </div>
  );
}
