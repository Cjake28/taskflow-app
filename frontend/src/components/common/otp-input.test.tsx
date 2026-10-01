import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OtpInput } from './otp-input';

function Harness({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <>
      <OtpInput
        label="Verification code"
        value={value}
        onChange={setValue}
        onComplete={onComplete}
      />
      <output data-testid="value">{value}</output>
    </>
  );
}

const boxes = () => screen.getAllByRole('textbox');

describe('OtpInput', () => {
  it('moves forward while typing and completes after the last digit', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    await user.click(boxes()[0]!);
    await user.keyboard('123456');

    expect(screen.getByTestId('value')).toHaveTextContent('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    expect(boxes()[5]).toHaveValue('6');
  });

  it('fills every box from a pasted code, ignoring spaces and dashes', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<Harness onComplete={onComplete} />);

    await user.click(boxes()[0]!);
    await user.paste('482 - 913');

    expect(screen.getByTestId('value')).toHaveTextContent('482913');
    expect(onComplete).toHaveBeenCalledWith('482913');
  });

  it('ignores letters and steps back with Backspace', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(boxes()[0]!);
    await user.keyboard('1a2');
    expect(screen.getByTestId('value')).toHaveTextContent('12');

    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('value')).toHaveTextContent(/^1$/);
    expect(boxes()[1]).toHaveFocus();

    await user.keyboard('{Backspace}');
    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
    expect(boxes()[0]).toHaveFocus();
  });

  it('labels the group and every digit for screen readers', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Verification code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveAttribute('autocomplete', 'one-time-code');
  });
});
