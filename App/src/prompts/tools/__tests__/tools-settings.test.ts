import { 
  isToolEnabled, 
  shouldAutoApprove, 
  isCommandWhitelisted, 
  isCommandBlacklisted,
  ToolSettings
} from '../index';

describe('Tool Settings', () => {
  // Sample tool settings for testing
  const sampleSettings: ToolSettings = {
    auto_approve_tools: false,
    walkthrough_tools: {
      command: true,
      web_search: false
    },
    action_tools: {
      command: false,
      web_search: true
    },
    auto_approve_walkthrough: {
      command: true,
      web_search: false
    },
    auto_approve_action: {
      command: false,
      web_search: true
    },
    whitelisted_commands: ['ls', 'echo', 'pwd'],
    blacklisted_commands: ['rm -rf', 'sudo', 'chmod']
  };

  describe('isToolEnabled', () => {
    it('should return true if tool is enabled for the mode', () => {
      expect(isToolEnabled('command', 'walkthrough', sampleSettings)).toBe(true);
      expect(isToolEnabled('web_search', 'action', sampleSettings)).toBe(true);
    });

    it('should return false if tool is disabled for the mode', () => {
      expect(isToolEnabled('web_search', 'walkthrough', sampleSettings)).toBe(false);
      expect(isToolEnabled('command', 'action', sampleSettings)).toBe(false);
    });

    it('should return true if no settings are provided', () => {
      expect(isToolEnabled('command', 'walkthrough')).toBe(true);
      expect(isToolEnabled('web_search', 'action')).toBe(true);
    });

    it('should return true if tool settings for the mode are not defined', () => {
      const partialSettings: ToolSettings = {
        walkthrough_tools: { command: true }
      };
      expect(isToolEnabled('command', 'action', partialSettings)).toBe(true);
    });
  });

  describe('shouldAutoApprove', () => {
    it('should return true if global auto-approve is enabled', () => {
      const settings: ToolSettings = {
        auto_approve_tools: true,
        walkthrough_tools: { command: true },
        action_tools: { command: true }
      };
      expect(shouldAutoApprove('command', 'walkthrough', settings)).toBe(true);
      expect(shouldAutoApprove('web_search', 'action', settings)).toBe(true);
    });

    it('should return true if tool is set to auto-approve for the mode', () => {
      expect(shouldAutoApprove('command', 'walkthrough', sampleSettings)).toBe(true);
      expect(shouldAutoApprove('web_search', 'action', sampleSettings)).toBe(true);
    });

    it('should return false if tool is not set to auto-approve for the mode', () => {
      expect(shouldAutoApprove('web_search', 'walkthrough', sampleSettings)).toBe(false);
      expect(shouldAutoApprove('command', 'action', sampleSettings)).toBe(false);
    });

    it('should return false if no settings are provided', () => {
      expect(shouldAutoApprove('command', 'walkthrough')).toBe(false);
      expect(shouldAutoApprove('web_search', 'action')).toBe(false);
    });
  });

  describe('isCommandWhitelisted', () => {
    it('should return true if command starts with a whitelisted command', () => {
      expect(isCommandWhitelisted('ls -la', sampleSettings)).toBe(true);
      expect(isCommandWhitelisted('echo "Hello World"', sampleSettings)).toBe(true);
      expect(isCommandWhitelisted('pwd', sampleSettings)).toBe(true);
    });

    it('should return false if command does not start with a whitelisted command', () => {
      expect(isCommandWhitelisted('cat file.txt', sampleSettings)).toBe(false);
      expect(isCommandWhitelisted('mkdir test', sampleSettings)).toBe(false);
    });

    it('should return false if no settings are provided', () => {
      expect(isCommandWhitelisted('ls -la')).toBe(false);
    });

    it('should return false if whitelisted_commands is empty', () => {
      const settings: ToolSettings = {
        whitelisted_commands: []
      };
      expect(isCommandWhitelisted('ls -la', settings)).toBe(false);
    });
  });

  describe('isCommandBlacklisted', () => {
    it('should return true if command starts with a blacklisted command', () => {
      expect(isCommandBlacklisted('rm -rf /', sampleSettings)).toBe(true);
      expect(isCommandBlacklisted('sudo apt-get install', sampleSettings)).toBe(true);
      expect(isCommandBlacklisted('chmod 777 file.txt', sampleSettings)).toBe(true);
    });

    it('should return false if command does not start with a blacklisted command', () => {
      expect(isCommandBlacklisted('cat file.txt', sampleSettings)).toBe(false);
      expect(isCommandBlacklisted('mkdir test', sampleSettings)).toBe(false);
    });

    it('should return false if no settings are provided', () => {
      expect(isCommandBlacklisted('rm -rf /')).toBe(false);
    });

    it('should return false if blacklisted_commands is empty', () => {
      const settings: ToolSettings = {
        blacklisted_commands: []
      };
      expect(isCommandBlacklisted('rm -rf /', settings)).toBe(false);
    });
  });
});