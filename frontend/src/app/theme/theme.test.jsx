import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './ThemeProvider.jsx';
import { useTheme } from './useTheme.js';

function Probe() {
  const { choice, resolved, setChoice } = useTheme();
  return (<><span data-testid="s">{choice}:{resolved}</span><button onClick={() => setChoice('light')}>light</button><button onClick={() => setChoice('bogus')}>bogus</button></>);
}
beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });

describe('ThemeProvider', () => {
  it('defaults to system (dark when the OS is not light), applies data-theme and persists the choice', async () => {
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('s')).toHaveTextContent('system:dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await user.click(screen.getByText('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('pulse-theme')).toBe('light');
  });
  it('ignores invalid values and restores a saved choice', async () => {
    localStorage.setItem('pulse-theme', 'light');
    const user = userEvent.setup();
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByTestId('s')).toHaveTextContent('light:light');
    await act(async () => { await user.click(screen.getByText('bogus')); });
    expect(screen.getByTestId('s')).toHaveTextContent('light:light');
  });
});
