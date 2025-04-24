import unittest
from unittest.mock import patch
import sys
import io

# Adjust the path to import from the parent directory
sys.path.insert(0, '..')
from detect_os import get_os

class TestDetectOS(unittest.TestCase):

    @patch('platform.system')
    def test_get_os_mac(self, mock_system):
        """Test OS detection for macOS."""
        mock_system.return_value = 'Darwin'
        self.assertEqual(get_os(), 'mac')

    @patch('platform.system')
    def test_get_os_windows(self, mock_system):
        """Test OS detection for Windows."""
        mock_system.return_value = 'Windows'
        self.assertEqual(get_os(), 'windows')

    @patch('platform.system')
    def test_get_os_linux(self, mock_system):
        """Test OS detection for Linux."""
        mock_system.return_value = 'Linux'
        self.assertEqual(get_os(), 'linux')

    @patch('platform.system')
    @patch('sys.stderr', new_callable=io.StringIO) # Capture stderr
    def test_get_os_unsupported(self, mock_stderr, mock_system):
        """Test OS detection for an unsupported OS."""
        mock_system.return_value = 'SunOS' # Example unsupported OS
        with self.assertRaises(SystemExit) as cm:
            get_os()
        self.assertEqual(cm.exception.code, 1)
        self.assertIn("Unsupported OS: sunos", mock_stderr.getvalue())

if __name__ == '__main__':
    unittest.main()