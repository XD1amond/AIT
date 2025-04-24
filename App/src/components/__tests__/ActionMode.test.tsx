import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionMode } from '../ActionMode'; // Adjust path as needed

describe('ActionMode Component', () => {
  test('renders placeholder content', () => {
    render(<ActionMode />);

    // Check for the title text within the card header
    expect(screen.getByText('Action Mode')).toBeInTheDocument(); // Check text directly

    // Check for the updated descriptive text
    expect(screen.getByText(/enter the computer problem or task/i)).toBeInTheDocument();

    // Check for the updated placeholder text
    expect(screen.getByPlaceholderText(/e\.g\., change my wallpaper, clear browser cache/i)).toBeInTheDocument();

    // Check for the button with the text "Go"
    expect(screen.getByRole('button', { name: /go/i })).toBeInTheDocument();
  });

  // Add more tests here later when Action Mode functionality is implemented
});