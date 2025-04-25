import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionMode } from '../modes/action-mode/ActionMode'; // Adjust path as needed

describe('ActionMode Component', () => {
  test('renders placeholder content', () => {
    render(<ActionMode />);

    // Check for the title text (now in sr-only element)
    expect(screen.getByText('Action Mode')).toBeInTheDocument();

    // Check for the input placeholder
    expect(screen.getByPlaceholderText('Type your problem...')).toBeInTheDocument();

    // Check for the submit button
    expect(screen.getByRole('button', { name: /submit task/i })).toBeInTheDocument();
  });

  // Add more tests here later when Action Mode functionality is implemented
});