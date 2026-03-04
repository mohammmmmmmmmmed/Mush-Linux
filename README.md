# Mush - Multi-Interface Transport System

High-performance download manager that uses multiple network connections simultaneously.

## Quick Start (Portable - No Installation)

### GUI Mode
```bash
./run-gui.sh
```

### CLI Mode
```bash
./run-cli.sh <URL>
```

## User Installation (Recommended)

Install to your home directory (no sudo required):
```bash
./install.sh
```

This installs to:
- `~/.local/share/mush/` - Application files
- `~/.local/bin/` - Launcher scripts
- `~/.local/share/applications/` - Desktop entry

Then use:
```bash
mush-gui          # Launch GUI
mush <URL>        # CLI download
```

Or find "Mush" in your application menu!

## Features

- Automatic network interface detection
- Parallel downloading across multiple connections
- Real-time progress tracking
- Automatic verification and repair
- Beautiful GUI with detailed statistics
- Desktop integration

## Uninstallation

```bash
./uninstall.sh
```

## System Requirements

- Linux (x86_64)
- Python 3.6+
- Node.js 18+ (for GUI)
- Active network connections

---

© 2024 Mush Development Team. All rights reserved.
