import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../page'; // Import the main page component
import { invoke } from '@tauri-apps/api/core'; // Import invoke for mocking if needed by child components

// Mock child components to isolate testing of the page logic
jest.mock('@/components/ActionMode', () => ({
  ActionMode: () => <div data-testid="action-mode">Action Mode Component</div>,
}));
jest.mock('@/components/WalkthroughMode', () => ({
  WalkthroughMode: () => <div data-testid="walkthrough-mode">Walkthrough Mode Component</div>,
}));

// Mock the core tauri api if WalkthroughMode still tries to invoke on render (even though mocked)
jest.mock('@tauri-apps/api/core');
const mockedInvoke = invoke as jest.Mock;

beforeEach(() => {
    mockedInvoke.mockClear();
    // Provide default mocks needed by WalkthroughMode even if it's mocked,
    // just in case its useEffect runs before Jest fully replaces it.
    mockedInvoke.mockResolvedValue({}); // Default resolve for any unexpected calls
});


describe('Home Page Component (Mode Switching)', () => {
  test('renders initial mode selection screen', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: /choose your mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /action mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /walkthrough mode/i })).toBeInTheDocument();
  });

  test('switches to Action Mode when Action Mode button is clicked', async () => {
    render(<Home />);
    const actionButton = screen.getByRole('button', { name: /action mode/i });
    fireEvent.click(actionButton);

    // Wait for Action Mode component to appear (using data-testid from mock)
    expect(await screen.findByTestId('action-mode')).toBeInTheDocument();
    // Ensure mode selection is gone
    expect(screen.queryByRole('heading', { name: /choose your mode/i })).not.toBeInTheDocument();
    // Check for back button
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  test('switches to Walkthrough Mode when Walkthrough Mode button is clicked', async () => {
    render(<Home />);
    const walkthroughButton = screen.getByRole('button', { name: /walkthrough mode/i });
    fireEvent.click(walkthroughButton);

    // Wait for Walkthrough Mode component to appear
    expect(await screen.findByTestId('walkthrough-mode')).toBeInTheDocument();
    // Ensure mode selection is gone
    expect(screen.queryByRole('heading', { name: /choose your mode/i })).not.toBeInTheDocument();
     // Check for back button
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
  });

  test('switches back to mode selection from Action Mode using back button', async () => {
    render(<Home />);
    // Go to Action Mode first
    fireEvent.click(screen.getByRole('button', { name: /action mode/i }));
    const backButton = await screen.findByRole('button', { name: /go back/i });

    // Click back button
    fireEvent.click(backButton);

    // Wait for mode selection screen to reappear
    expect(await screen.findByRole('heading', { name: /choose your mode/i })).toBeInTheDocument();
    // Ensure Action Mode component is gone
    expect(screen.queryByTestId('action-mode')).not.toBeInTheDocument();
  });

   test('switches back to mode selection from Walkthrough Mode using back button', async () => {
    render(<Home />);
    // Go to Walkthrough Mode first
    fireEvent.click(screen.getByRole('button', { name: /walkthrough mode/i }));
    const backButton = await screen.findByRole('button', { name: /go back/i });

    // Click back button
    fireEvent.click(backButton);

    // Wait for mode selection screen to reappear
    expect(await screen.findByRole('heading', { name: /choose your mode/i })).toBeInTheDocument();
    // Ensure Walkthrough Mode component is gone
    expect(screen.queryByTestId('walkthrough-mode')).not.toBeInTheDocument();
  });

});