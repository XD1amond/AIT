import React from 'react';
import '@testing-library/jest-dom';
import { parseToolUse, containsToolUse, extractTextAroundToolUse } from '@/prompts/tools/tool-parser';

// Mock the tauri API
jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn(),
  isTauri: jest.fn().mockResolvedValue(true),
}));

describe('Tool Parser', () => {
  describe('parseToolUse', () => {
    it('should correctly parse a command tool use', () => {
      const text = `I'll help you list the files in your directory.

<command>
<command>ls -la</command>
</command>

This will show all files, including hidden ones.`;

      const result = parseToolUse(text);
      
      expect(result).not.toBeNull();
      expect(result?.name).toBe('command');
      expect(result?.params.command).toBe('ls -la');
    });

    it('should correctly parse a web search tool use', () => {
      const text = `Let me search for that information.

<web_search>
<query>latest AI developments 2025</query>
<limit>3</limit>
</web_search>

I'll analyze the results for you.`;

      const result = parseToolUse(text);
      
      expect(result).not.toBeNull();
      expect(result?.name).toBe('web_search');
      expect(result?.params.query).toBe('latest AI developments 2025');
      expect(result?.params.limit).toBe('3');
    });

    it('should return null for text without tool use', () => {
      const text = 'This is just regular text without any tool use.';
      const result = parseToolUse(text);
      expect(result).toBeNull();
    });
  });

  describe('containsToolUse', () => {
    it('should return true when text contains a tool use', () => {
      const text = `Let me help you with that.
<command>
<command>echo "Hello World"</command>
</command>`;
      
      expect(containsToolUse(text)).toBe(true);
    });

    it('should return false when text does not contain a tool use', () => {
      const text = 'This is just regular text without any tool use.';
      expect(containsToolUse(text)).toBe(false);
    });
  });

  describe('extractTextAroundToolUse', () => {
    it('should extract text before and after a tool use', () => {
      const text = `I'll help you with that.

<command>
<command>echo "Hello World"</command>
</command>

This will print "Hello World" to the console.`;

      const result = extractTextAroundToolUse(text);
      
      expect(result.before).toBe("I'll help you with that.");
      expect(result.after).toBe('This will print "Hello World" to the console.');
    });

    it('should handle text with only content before a tool use', () => {
      const text = `I'll help you with that.

<command>
<command>echo "Hello World"</command>
</command>`;

      const result = extractTextAroundToolUse(text);
      
      expect(result.before).toBe("I'll help you with that.");
      expect(result.after).toBe('');
    });

    it('should handle text with only content after a tool use', () => {
      const text = `<command>
<command>echo "Hello World"</command>
</command>

This will print "Hello World" to the console.`;

      const result = extractTextAroundToolUse(text);
      
      expect(result.before).toBe('');
      expect(result.after).toBe('This will print "Hello World" to the console.');
    });

    it('should return the original text when no tool use is found', () => {
      const text = 'This is just regular text without any tool use.';
      const result = extractTextAroundToolUse(text);
      
      expect(result.before).toBe(text);
      expect(result.after).toBe('');
    });
  });
});