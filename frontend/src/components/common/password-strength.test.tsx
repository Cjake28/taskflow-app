import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordStrength } from './password-strength';

function filledSegments(meter: HTMLElement) {
  return Array.from(meter.children).filter(
    (segment) => segment.getAttribute('data-filled') === 'true',
  );
}

function checklist() {
  const list = screen.getByRole('list', { name: 'Password requirements' });
  return within(list)
    .getAllByRole('listitem')
    .map((item) => ({
      text: item.textContent ?? '',
      passed: item.getAttribute('data-passed') === 'true',
    }));
}

describe('PasswordStrength', () => {
  it('shows an empty meter and unmet checklist for an empty password', () => {
    render(<PasswordStrength password="" />);

    const meter = screen.getByRole('meter', { name: 'Password strength' });
    expect(meter).toHaveAttribute('aria-valuenow', '0');
    expect(filledSegments(meter)).toHaveLength(0);
    expect(checklist().every((item) => !item.passed)).toBe(true);
    expect(screen.queryByText('Weak')).not.toBeInTheDocument();
  });

  it('rates a weak password and hints at the first missing rule', () => {
    render(<PasswordStrength password="abc" />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '1');
    expect(meter).toHaveAttribute('aria-valuetext', 'Weak');
    expect(filledSegments(meter)).toHaveLength(1);
    expect(screen.getByText('Weak')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
  });

  it('shows "Fair" with two segments', () => {
    render(<PasswordStrength password="password1" />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '2');
    expect(filledSegments(meter)).toHaveLength(2);
    expect(screen.getByText('Fair')).toBeInTheDocument();
  });

  it('shows "Good" with three segments and a live checklist when one rule is missing', () => {
    render(<PasswordStrength password="Passw0rd" />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '3');
    expect(filledSegments(meter)).toHaveLength(3);
    expect(screen.getByText('Good')).toBeInTheDocument();

    const items = checklist();
    expect(items).toEqual([
      { text: '8+ characters(met)', passed: true },
      { text: 'Upper & lowercase(met)', passed: true },
      { text: 'A number(met)', passed: true },
      { text: 'A symbol(not met)', passed: false },
    ]);
    expect(screen.getByText('Add a symbol to make it strong')).toBeInTheDocument();
  });

  it('marks upper & lowercase as unmet until both cases are present', () => {
    render(<PasswordStrength password="password1!" />);
    expect(checklist().find((item) => item.text.startsWith('Upper'))?.passed).toBe(false);
  });

  it('fills all four segments for a strong password', () => {
    render(<PasswordStrength password="Str0ng!Passw0rd" />);

    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '4');
    expect(meter).toHaveAttribute('aria-valuetext', 'Strong');
    expect(filledSegments(meter)).toHaveLength(4);
    expect(checklist().every((item) => item.passed)).toBe(true);
    expect(screen.getByText("Nice, that's a good one")).toBeInTheDocument();
  });
});
