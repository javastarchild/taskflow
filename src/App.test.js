import { render, screen } from '@testing-library/react';
import App from './App';

// Plain functions, not jest.fn(): CRA's jest config resets mocks before each test.
jest.mock('./api/client', () => ({
  getTasks: () => Promise.resolve([]),
  getDoneTasks: () => Promise.resolve([]),
}));

test('renders the planner shell with its tabs', async () => {
  render(<App />);
  expect(screen.getByText('Planner')).toBeInTheDocument();
  for (const tab of ['Active', 'Completed', 'Activity']) {
    expect(await screen.findByRole('button', { name: tab })).toBeInTheDocument();
  }
});
