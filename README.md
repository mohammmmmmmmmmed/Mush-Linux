# Mush - Multi-Interface Transport System

**Version 1.0.0**

Mush is a high-performance download manager that intelligently utilizes all available network interfaces simultaneously to maximize download speeds. By distributing chunks across multiple connections (WiFi, Ethernet, mobile hotspot, etc.), Mush can dramatically reduce download times compared to traditional single-connection downloaders.

## 🚀 Quick Start (Portable - No Installation)

Run directly from the extracted directory without installation:

### GUI Mode (Recommended)
```bash
./run-gui.sh
```

The GUI provides:
- Real-time progress tracking with visual indicators
- Per-interface statistics and performance metrics
- Download history with detailed reports
- Time saved calculations vs single-connection downloads
- Pause/resume functionality
- Automatic retry and error recovery

### CLI Mode
```bash
./run-cli.sh <URL>
```

Example:
```bash
./run-cli.sh https://example.com/large-file.zip
```

## 📦 User Installation (Recommended)

Install to your home directory (no sudo/root required):

```bash
./install.sh
```

This installs to:
- `~/.local/share/mush/` - Application files and binaries
- `~/.local/bin/` - Launcher scripts (mush, mush-gui)
- `~/.local/share/applications/` - Desktop entry for app menu

After installation:
```bash
mush-gui          # Launch GUI
mush <URL>        # CLI download
```

Or find **"Mush"** in your application menu/launcher!

**Note:** Ensure `~/.local/bin` is in your PATH. If `mush-gui` command is not found, add this to your `~/.bashrc` or `~/.zshrc`:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## ✨ Features

### Core Capabilities
- **Multi-Interface Detection**: Automatically discovers all available network interfaces (WiFi, Ethernet, VPN, mobile hotspot)
- **Intelligent Scheduling**: ML-based prediction models optimize chunk distribution across interfaces
- **Parallel Downloads**: Simultaneous downloads across multiple connections with configurable concurrency
- **Real-time Monitoring**: Live performance metrics including throughput, latency, and packet loss per interface
- **Automatic Verification**: SHA-256 integrity checking with automatic chunk re-download on failure
- **Smart Rescheduling**: Dynamic reallocation of chunks based on real-time performance

### User Experience
- **Beautiful GUI**: Modern Electron-based interface with dark theme
- **Download History**: Persistent history with detailed statistics and reports
- **Time Savings**: Calculates and displays time saved vs single-connection downloads
- **Desktop Integration**: Native application menu entry with icon
- **Progress Tracking**: Visual progress bars with chunk-level granularity
- **Error Recovery**: Automatic retry logic with exponential backoff

### Technical Features
- **Chunk-based Architecture**: Files split into configurable chunks for parallel processing
- **Socket Management**: Efficient connection pooling and reuse
- **Performance Modeling**: Predictive algorithms for optimal interface selection
- **JSON-based Pipeline**: Clean data flow between processing phases
- **Stripped Binaries**: Optimized, production-ready executables

## 📊 How It Works

Mush operates through an 11-phase pipeline:

1. **Discovery**: Detect available network interfaces
2. **Chunking**: Split file into downloadable chunks
3. **Integrity**: Generate checksums for verification
4. **Sockets**: Establish connections per interface
5. **Measurements**: Collect performance metrics
6. **Modeling**: Predict interface performance
7. **Scheduling**: Assign chunks to optimal interfaces
8. **Execution**: Download chunks in parallel
9. **Verification**: Validate integrity and reassemble
10. **Rescheduling**: Reallocate failed/slow chunks
11. **Analysis**: Generate performance reports

## 🗑️ Uninstallation

```bash
./uninstall.sh
```

This removes:
- All installed files from `~/.local/share/mush/`
- Launcher scripts from `~/.local/bin/`
- Desktop entry from `~/.local/share/applications/`

## 💻 System Requirements

### Minimum Requirements
- **OS**: Linux (x86_64)
- **Python**: 3.6 or higher
- **Node.js**: 18.0 or higher (for GUI)
- **RAM**: 512 MB
- **Disk**: 100 MB free space

### Network Requirements
- At least one active network interface
- Multiple interfaces recommended for best performance
- Internet connectivity for downloads

### Supported Interfaces
- Ethernet (wired connections)
- WiFi (wireless networks)
- Mobile hotspot/tethering
- VPN connections
- Tunnel interfaces (e.g., Cloudflare WARP)

## 🔧 Troubleshooting

### GUI won't start
- Ensure Node.js 18+ is installed: `node --version`
- Check if npm dependencies installed: `cd ~/.local/share/mush/gui && npm install`

### Command not found
- Verify `~/.local/bin` is in PATH: `echo $PATH`
- Add to PATH in `~/.bashrc`: `export PATH="$HOME/.local/bin:$PATH"`

### No interfaces detected
- Check network status: `ip link show`
- Ensure at least one interface is UP
- Run with elevated permissions if needed

### Download fails
- Verify URL is accessible: `curl -I <URL>`
- Check firewall settings
- Ensure sufficient disk space

## 📝 License

© 2026 Mush Development Team. All rights reserved.

This is proprietary software. Unauthorized copying, distribution, modification, or reverse engineering is prohibited.

## 🆘 Support

For issues, questions, or feature requests:
- Email: support@mush.local
- Documentation: See included guides in the installation directory

---

**Enjoy blazing-fast downloads with Mush!** 🚀
