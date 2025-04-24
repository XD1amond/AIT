import subprocess
import sys
import os
from detect_os import get_os

def launch_application():
    """Launches the desktop application based on the detected OS."""
    detected_os = get_os()
    app_path = "" # Placeholder - needs to be determined based on build location

    # Determine the path to the App executable relative to this script
    # This assumes the Companion scripts are run from the Companion directory
    # and the App build exists at a known relative path.
    # Adjust this logic based on the actual build output structure.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_base_dir = os.path.abspath(os.path.join(script_dir, '..', 'App')) # Go up one level, then into App

    print(f"Detected OS: {detected_os}")
    print(f"Script directory: {script_dir}")
    print(f"Calculated App base directory: {app_base_dir}")


    try:
        if detected_os == "mac":
            # Example: Find .app bundle in src-tauri/target/release/bundle/macos/
            # This path needs verification after the App is built
            app_bundle_dir = os.path.join(app_base_dir, 'src-tauri', 'target', 'release', 'bundle', 'macos')
            # Find the .app file (adjust name if needed)
            app_name = next((f for f in os.listdir(app_bundle_dir) if f.endswith('.app')), None)
            if not app_name:
                raise FileNotFoundError("Mac .app bundle not found in expected location.")
            app_path = os.path.join(app_bundle_dir, app_name)
            print(f"Attempting to launch Mac app: {app_path}")
            subprocess.run(["open", app_path], check=True)

        elif detected_os == "windows":
            # Example: Find .exe in src-tauri/target/release/
            # This path needs verification
            app_exe_dir = os.path.join(app_base_dir, 'src-tauri', 'target', 'release')
            # Find the .exe file (adjust name if needed)
            app_name = next((f for f in os.listdir(app_exe_dir) if f.endswith('.exe')), None)
            if not app_name:
                 raise FileNotFoundError("Windows .exe not found in expected location.")
            app_path = os.path.join(app_exe_dir, app_name)
            print(f"Attempting to launch Windows app: {app_path}")
            subprocess.run([app_path], check=True)

        elif detected_os == "linux":
            # Example: Find AppImage or deb package execution command
            # This path needs verification - might be in src-tauri/target/release/bundle/appimage/ or similar
            app_bundle_dir = os.path.join(app_base_dir, 'src-tauri', 'target', 'release', 'bundle', 'appimage')
            app_name = next((f for f in os.listdir(app_bundle_dir) if f.endswith('.AppImage')), None)
            if not app_name:
                 raise FileNotFoundError("Linux AppImage not found in expected location.")
            app_path = os.path.join(app_bundle_dir, app_name)
            # Make executable if needed
            os.chmod(app_path, 0o755)
            print(f"Attempting to launch Linux app: {app_path}")
            subprocess.run([app_path], check=True)

        else:
            print(f"Launch logic not implemented for OS: {detected_os}", file=sys.stderr)
            sys.exit(1)

        print(f"Successfully launched application for {detected_os}.")

    except FileNotFoundError as e:
        print(f"Error: Application executable not found. {e}", file=sys.stderr)
        print("Please ensure the App has been built correctly and the path in launch_app.py is accurate.", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Error launching application: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    launch_application()