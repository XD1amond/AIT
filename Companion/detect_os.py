import platform
import sys

def get_os():
    """Detects the host operating system."""
    system = platform.system().lower()
    if system == "darwin":
        return "mac"
    elif system == "windows":
        return "windows"
    elif system == "linux":
        return "linux"
    else:
        print(f"Unsupported OS: {system}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    print(get_os())