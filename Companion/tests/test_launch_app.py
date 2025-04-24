import unittest
from unittest.mock import patch, MagicMock, mock_open, call
import sys
import os
import subprocess
import io

# Adjust the path to import from the parent directory
sys.path.insert(0, '..')
# We need to import the module we are testing
import launch_app

class TestLaunchApp(unittest.TestCase):

    # --- Mocks Setup ---
    # We need to mock dependencies used by launch_app.py:
    # - detect_os.get_os
    # - os.path.abspath, os.path.join, os.path.dirname
    # - os.listdir
    # - os.chmod (for Linux)
    # - subprocess.run

    @patch('launch_app.get_os')
    @patch('subprocess.run')
    @patch('os.path.abspath')
    @patch('os.path.join')
    @patch('os.listdir')
    @patch('os.path.dirname')
    def test_launch_mac(self, mock_dirname, mock_listdir, mock_join, mock_abspath, mock_run, mock_get_os):
        """Test launching the app on macOS."""
        mock_get_os.return_value = 'mac'
        mock_dirname.return_value = '/path/to/Companion'
        mock_abspath.return_value = '/path/to/App' # Mocked App base dir

        # Configure os.path.join to return expected paths based on input
        def join_side_effect(*args):
            if args == ('/path/to/Companion', '..', 'App'):
                return '/path/to/App'
            elif args == ('/path/to/App', 'src-tauri', 'target', 'release', 'bundle', 'macos'):
                return '/path/to/App/src-tauri/target/release/bundle/macos'
            elif args == ('/path/to/App/src-tauri/target/release/bundle/macos', 'TestApp.app'):
                 return '/path/to/App/src-tauri/target/release/bundle/macos/TestApp.app'
            return os.path.normpath(os.path.join(*args)) # Default join behavior
        mock_join.side_effect = join_side_effect

        mock_listdir.return_value = ['SomeOtherFile', 'TestApp.app'] # Simulate finding the app

        launch_app.launch_application()

        # Assertions
        mock_get_os.assert_called_once()
        mock_listdir.assert_called_with('/path/to/App/src-tauri/target/release/bundle/macos')
        mock_run.assert_called_once_with(['open', '/path/to/App/src-tauri/target/release/bundle/macos/TestApp.app'], check=True)

    @patch('launch_app.get_os')
    @patch('subprocess.run')
    @patch('os.path.abspath')
    @patch('os.path.join')
    @patch('os.listdir')
    @patch('os.path.dirname')
    def test_launch_windows(self, mock_dirname, mock_listdir, mock_join, mock_abspath, mock_run, mock_get_os):
        """Test launching the app on Windows."""
        mock_get_os.return_value = 'windows'
        mock_dirname.return_value = 'C:\\path\\to\\Companion'
        mock_abspath.return_value = 'C:\\path\\to\\App'

        def join_side_effect(*args):
             if args == ('C:\\path\\to\\Companion', '..', 'App'):
                 return 'C:\\path\\to\\App'
             elif args == ('C:\\path\\to\\App', 'src-tauri', 'target', 'release'):
                 return 'C:\\path\\to\\App\\src-tauri\\target\\release'
             elif args == ('C:\\path\\to\\App\\src-tauri\\target\\release', 'TestApp.exe'):
                  return 'C:\\path\\to\\App\\src-tauri\\target\\release\\TestApp.exe'
             return os.path.normpath(os.path.join(*args))
        mock_join.side_effect = join_side_effect

        mock_listdir.return_value = ['config.toml', 'TestApp.exe']

        launch_app.launch_application()

        mock_get_os.assert_called_once()
        mock_listdir.assert_called_with('C:\\path\\to\\App\\src-tauri\\target\\release')
        mock_run.assert_called_once_with(['C:\\path\\to\\App\\src-tauri\\target\\release\\TestApp.exe'], check=True)

    @patch('launch_app.get_os')
    @patch('subprocess.run')
    @patch('os.path.abspath')
    @patch('os.path.join')
    @patch('os.listdir')
    @patch('os.chmod')
    @patch('os.path.dirname')
    def test_launch_linux(self, mock_dirname, mock_chmod, mock_listdir, mock_join, mock_abspath, mock_run, mock_get_os):
        """Test launching the app on Linux."""
        mock_get_os.return_value = 'linux'
        mock_dirname.return_value = '/path/to/Companion'
        mock_abspath.return_value = '/path/to/App'

        def join_side_effect(*args):
            if args == ('/path/to/Companion', '..', 'App'):
                return '/path/to/App'
            elif args == ('/path/to/App', 'src-tauri', 'target', 'release', 'bundle', 'appimage'):
                return '/path/to/App/src-tauri/target/release/bundle/appimage'
            elif args == ('/path/to/App/src-tauri/target/release/bundle/appimage', 'TestApp.AppImage'):
                 return '/path/to/App/src-tauri/target/release/bundle/appimage/TestApp.AppImage'
            return os.path.normpath(os.path.join(*args))
        mock_join.side_effect = join_side_effect

        mock_listdir.return_value = ['icon.png', 'TestApp.AppImage']

        launch_app.launch_application()

        mock_get_os.assert_called_once()
        mock_listdir.assert_called_with('/path/to/App/src-tauri/target/release/bundle/appimage')
        mock_chmod.assert_called_once_with('/path/to/App/src-tauri/target/release/bundle/appimage/TestApp.AppImage', 0o755)
        mock_run.assert_called_once_with(['/path/to/App/src-tauri/target/release/bundle/appimage/TestApp.AppImage'], check=True)

    @patch('launch_app.get_os')
    @patch('subprocess.run')
    @patch('os.path.abspath')
    @patch('os.path.join')
    @patch('os.listdir')
    @patch('os.path.dirname')
    @patch('sys.stderr', new_callable=io.StringIO) # Capture stderr
    def test_launch_mac_not_found(self, mock_stderr, mock_dirname, mock_listdir, mock_join, mock_abspath, mock_run, mock_get_os):
        """Test launch failure when Mac .app is not found."""
        mock_get_os.return_value = 'mac'
        mock_dirname.return_value = '/path/to/Companion'
        mock_abspath.return_value = '/path/to/App'
        # Use a simple lambda to avoid recursion with the original os.path.join
        mock_join.side_effect = lambda *args: os.path.normpath("/".join(args))
        mock_listdir.return_value = ['SomeOtherFile'] # App not present

        with self.assertRaises(SystemExit) as cm:
            launch_app.launch_application()

        self.assertEqual(cm.exception.code, 1)
        self.assertIn("Application executable not found", mock_stderr.getvalue())
        self.assertIn("Mac .app bundle not found", mock_stderr.getvalue())
        mock_run.assert_not_called()

    @patch('launch_app.get_os')
    @patch('subprocess.run')
    @patch('os.path.abspath')
    @patch('os.path.join')
    @patch('os.listdir')
    @patch('os.path.dirname')
    @patch('sys.stderr', new_callable=io.StringIO)
    def test_launch_subprocess_error(self, mock_stderr, mock_dirname, mock_listdir, mock_join, mock_abspath, mock_run, mock_get_os):
        """Test launch failure due to subprocess error."""
        mock_get_os.return_value = 'windows'
        mock_dirname.return_value = 'C:\\path\\to\\Companion'
        mock_abspath.return_value = 'C:\\path\\to\\App'
        # Use a simple lambda to avoid recursion with the original os.path.join
        mock_join.side_effect = lambda *args: os.path.normpath("\\".join(args)) # Basic Windows path join
        mock_listdir.return_value = ['TestApp.exe']
        mock_run.side_effect = subprocess.CalledProcessError(1, 'cmd') # Simulate launch failure

        with self.assertRaises(SystemExit) as cm:
            launch_app.launch_application()

        self.assertEqual(cm.exception.code, 1)
        self.assertIn("Error launching application", mock_stderr.getvalue())
        mock_run.assert_called_once() # Ensure it was attempted


if __name__ == '__main__':
    # Need to explicitly add the parent directory for imports if run directly
    if '..' not in sys.path:
         sys.path.insert(0, '..')
    # Re-import after path adjustment if running directly
    import launch_app
    import io # Make sure io is imported if running directly

    unittest.main()