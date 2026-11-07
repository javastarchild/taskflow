import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeSelector } from './ThemeSelector';

test('theme choice is applied and restored on the next visit', () => {
  localStorage.clear();
  const { unmount } = render(<ThemeSelector />);
  expect(screen.getByLabelText('Theme')).toHaveValue('system');
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'dark' } });
  expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  unmount();
  render(<ThemeSelector />);
  expect(screen.getByLabelText('Theme')).toHaveValue('dark');
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'light' } });
  expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'system' } });
  expect(document.documentElement).toHaveAttribute('data-theme', 'system');
});
