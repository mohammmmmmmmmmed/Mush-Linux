(function () {
  const logEl = document.getElementById('log');
  const metadataStatus = document.getElementById('metadataStatus');
  const interfaceSelect = document.getElementById('interfaceSelect');
  const analyticsCharts = document.getElementById('analyticsCharts');
  const analyticsEmpty = document.getElementById('analyticsEmpty');
  const historyList = document.getElementById('historyList');

  function getFormOptions() {
    const outputDir = document.getElementById('outputDir').value.trim() || 'outputs';
    const outputFilename = document.getElementById('outputFilename').value.trim() || null;
    return {
      outputDir,
      outputFilename: outputFilename || undefined,
      url: document.getElementById('url').value.trim(),
      file_size: document.getElementById('fileSize').value.trim(),
      chunk_size: document.getElementById('chunkSize').value.trim(),
      dest: document.getElementById('dest').value.trim(),
      intervals: document.getElementById('intervals').value.trim(),
      interval_ms: document.getElementById('intervalMs').value.trim(),
      alpha: document.getElementById('alpha').value.trim(),
      wt: document.getElementById('wt').value.trim(),
      wl: document.getElementById('wl').value.trim(),
      wp: document.getElementById('wp').value.trim(),
      ws: document.getElementById('ws').value.trim(),
      concurrency: document.getElementById('concurrency').value.trim(),
      timeout: document.getElementById('timeout').value.trim(),
    };
  }

  function setFormValues(updates) {
    if (updates.contentLength != null) document.getElementById('fileSize').value = updates.contentLength;
    if (updates.suggestedFilename != null) document.getElementById('outputFilename').value = updates.suggestedFilename;
  }

  // ——— Fetch metadata ———
  document.getElementById('fetchMetadata').addEventListener('click', async () => {
    const url = document.getElementById('url').value.trim();
    if (!url) {
      metadataStatus.textContent = 'Enter a URL first.';
      metadataStatus.className = 'metadata-status error';
      return;
    }
    metadataStatus.textContent = 'Fetching…';
    metadataStatus.className = 'metadata-status';
    try {
      const result = await window.mush.fetchMetadata(url);
      if (result.error) {
        metadataStatus.textContent = result.error;
        metadataStatus.className = 'metadata-status error';
        return;
      }
      setFormValues({
        contentLength: result.contentLength || '',
        suggestedFilename: result.suggestedFilename || '',
      });
      metadataStatus.textContent = result.contentLength
        ? `Size: ${result.contentLength} bytes · Filename: ${result.suggestedFilename || '(from URL)'}`
        : `Filename: ${result.suggestedFilename || '(from URL)'} (no Content-Length)`;
      metadataStatus.className = 'metadata-status success';
    } catch (e) {
      metadataStatus.textContent = e.message || 'Failed';
      metadataStatus.className = 'metadata-status error';
    }
  });

  // ——— View switching ———
  const views = { config: 0, run: 1, history: 2, analytics: 3 };
  const sidebarTitles = ['Configuration', 'Run', 'History', 'Interface analytics'];
  const sidebarContents = ['configForm', 'runSidebar', 'historySidebar', 'analyticsSidebar'];

  document.querySelectorAll('.activity-bar .icon').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const view = el.dataset.view;
      document.querySelectorAll('.activity-bar .icon').forEach((i) => i.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('sidebarTitle').textContent = sidebarTitles[views[view]];
      sidebarContents.forEach((id, idx) => {
        document.getElementById(id).style.display = idx === views[view] ? 'block' : 'none';
      });
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === view));
      document.querySelectorAll('.panel').forEach((p) => {
        p.classList.toggle('active', p.id === 'panel' + view.charAt(0).toUpperCase() + view.slice(1));
      });
      if (view === 'history') renderHistory();
    });
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.tab;
      document.querySelectorAll('.activity-bar .icon').forEach((i) => i.classList.toggle('active', i.dataset.view === view));
      document.getElementById('sidebarTitle').textContent = sidebarTitles[views[view]];
      sidebarContents.forEach((id, idx) => {
        document.getElementById(id).style.display = idx === views[view] ? 'block' : 'none';
      });
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === view));
      document.querySelectorAll('.panel').forEach((p) => {
        p.classList.toggle('active', p.id === 'panel' + view.charAt(0).toUpperCase() + view.slice(1));
      });
      if (view === 'history') renderHistory();
    });
  });

  // ——— Run phase: progress, stop/pause/resume ———
  const progressArea = document.getElementById('progressArea');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const elapsedText = document.getElementById('elapsedText');
  const progressPerInterface = document.getElementById('progressPerInterface');
  const btnStop = document.getElementById('btnStop');
  const btnPause = document.getElementById('btnPause');
  const btnResume = document.getElementById('btnResume');
  let activeHistoryId = null;

  let running = false;
  let streaming = false;
  let logBuffer = '';
  let phase8ExitResolve = null;
  let lastPhase8ExitCode = -1;
  let phase8StartTime = null;
  let phase8Totals = { total: 0, perInterface: {} };
  let phase8Current = 0;
  let phase8CompletedPerInterface = {};
  let elapsedInterval = null;

  function setStreamingControls(enabled) {
    streaming = enabled;
    btnStop.disabled = !enabled;
    btnPause.disabled = !enabled;
    btnResume.disabled = !enabled;
    document.querySelectorAll('.phases [data-phase]').forEach((b) => { b.disabled = enabled; });
  }

  // ——— History Logic ———
  async function renderHistory(passedHistory) {
    let history = passedHistory;
    if (!history) {
      try {
        history = await window.mush.getHistory();
      } catch (e) {
        console.error('Failed to get history', e);
        history = [];
      }
    }

    if (!history) history = [];

    const filter = document.getElementById('historyFilter').value.toLowerCase();
    const filtered = history.filter(h => !filter || (h.filename || '').toLowerCase().includes(filter));

    // Sort by date desc
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    const html = filtered.map(item => {
      const dateStr = new Date(item.date).toLocaleString();
      const statusClass = item.status === 'Completed' ? 'success' : (item.status === 'Running' ? 'running' : 'error');
      // Ensure path is safe
      const cleanPath = (item.path || '').replace(/'/g, "\\'");
      const durationStr = item.duration ? `(${item.duration.toFixed(1)}s)` : '';
      return `
        <div class="history-item">
          <div class="info">
            <div class="filename" title="${escapeHtml(item.path || '')}">${escapeHtml(item.filename || 'Unknown')}</div>
            <div class="meta">${escapeHtml(item.url || '')}</div>
            <div class="meta">${dateStr} ${durationStr}</div>
          </div>
          <div class="status ${statusClass}">${escapeHtml(item.status || 'Unknown')}</div>
          <div class="actions">
            <button class="btn btn-sm btn-secondary" onclick="openReport('${item.id}')">Report</button>
            <button class="btn btn-sm btn-secondary" onclick="openFile('${item.id}')">Open</button>
            <button class="btn btn-sm btn-danger" onclick="deleteHistory('${item.id}')">X</button>
          </div>
        </div>
      `;
    }).join('');

    historyList.innerHTML = html || '<div style="padding:12px; color:var(--text-muted); text-align:center;">No history items found.</div>';
  }

  // Report Logic
  const reportModal = document.getElementById('reportModal');
  const reportBody = document.getElementById('reportBody');
  document.getElementById('closeModal').onclick = () => { reportModal.style.display = 'none'; };
  window.onclick = (event) => { if (event.target == reportModal) reportModal.style.display = 'none'; };

  window.openReport = async (id) => {
    const history = await window.mush.getHistory();
    const item = history.find(h => String(h.id) === String(id));
    if (!item) return;

    reportModal.style.display = 'block';
    reportBody.innerHTML = 'Loading output analysis...';

    // Try reading execution.json
    try {
      const execRaw = await window.mush.readOutputFile(item.outputDir || 'outputs', 'execution.json');
      if (!execRaw) {
        reportBody.innerHTML = 'No execution.json found for this download.';
        return;
      }
      const exec = JSON.parse(execRaw);
      const results = exec.execution_results || [];

      const totalChunks = results.length;
      const totalBytes = results.reduce((sum, r) => sum + (r.bytes_received || r.bytes_downloaded || 0), 0);
      const errors = results.filter(r => r.status !== 'SUCCESS' && r.status !== 'COMPLETED').length;

      // Calculate speeds per chunk to get avg
      // Or calculate total transfer / total time (if available in summary, but execution.json is per-chunk)
      // We can aggregate by interface
      const byInterface = {};
      results.forEach(r => {
        const iface = r.assigned_interface_name || r.interface_name || 'unknown';
        if (!byInterface[iface]) byInterface[iface] = { bytes: 0, chunks: 0, timeSum: 0 };
        byInterface[iface].bytes += (r.bytes_received || r.bytes_downloaded || 0);
        byInterface[iface].chunks += 1;
        byInterface[iface].timeSum += (r.download_time_ms || r.time_taken_ms || 0);
      });

      let ifaceRows = '';
      for (const [name, stats] of Object.entries(byInterface)) {
        const avgTime = stats.chunks ? (stats.timeSum / stats.chunks) : 0;
        const avgSpeed = avgTime > 0 ? ((stats.bytes * 8) / (avgTime / 1000) / 1000000).toFixed(2) : '0';
        ifaceRows += `<tr>
          <td>${escapeHtml(name)}</td>
          <td>${stats.chunks}</td>
          <td>${(stats.bytes / 1024 / 1024).toFixed(2)} MB</td>
          <td>~${avgSpeed} Mbps/chunk</td>
        </tr>`;
      }

      let durationSec = item.duration;
      if (!durationSec && exec.summary && exec.summary.total_execution_time_ms) {
        durationSec = exec.summary.total_execution_time_ms / 1000;
      }

      const durationStr = durationSec ? durationSec.toFixed(2) + 's' : 'N/A';
      const avgSpeedTotal = (durationSec && totalBytes > 0) ? ((totalBytes * 8) / durationSec / 1000000).toFixed(2) + ' Mbps' : 'N/A';

      // Phase timings section
      let phaseTimingsHtml = '';
      if (item.phaseTimings && Object.keys(item.phaseTimings).length > 0) {
        const phaseNames = {
          phase1: 'Phase 1: Discovery',
          phase2: 'Phase 2: Chunker',
          phase3: 'Phase 3: Integrity',
          phase4: 'Phase 4: Sockets',
          phase5: 'Phase 5: Measurements',
          phase6: 'Phase 6: Modeler',
          phase7: 'Phase 7: Scheduler',
          phase8: 'Phase 8: Executor',
          phase9: 'Phase 9: Verification',
        };
        
        let phaseRows = '';
        const totalPhaseTime = Object.values(item.phaseTimings).reduce((sum, t) => sum + t, 0);
        
        for (const [phase, time] of Object.entries(item.phaseTimings).sort()) {
          const pct = totalPhaseTime > 0 ? ((time / totalPhaseTime) * 100).toFixed(1) : '0';
          phaseRows += `<tr>
            <td>${phaseNames[phase] || phase}</td>
            <td>${time.toFixed(2)}s</td>
            <td>${pct}%</td>
          </tr>`;
        }
        
        phaseTimingsHtml = `
          <div class="report-section">
            <h4>Phase Timings</h4>
            <table class="report-table">
              <thead><tr><th>Phase</th><th>Duration</th><th>% of Total</th></tr></thead>
              <tbody>${phaseRows}</tbody>
            </table>
          </div>
        `;
      }

      // Time saved calculation
      let timeSavedHtml = '';
      let reportData = null; // Will store calculated report data
      
      if (Object.keys(byInterface).length > 1 && totalBytes > 0 && durationSec > 0) {
        // Get actual wall-clock download time (phase 8)
        const actualDownloadTime = item.phaseTimings && item.phaseTimings.phase8 
          ? item.phaseTimings.phase8 
          : durationSec;

        // Calculate actual download speed per interface (bytes per second)
        // Use wall-clock time, not cumulative thread time
        const interfaceSpeeds = {};
        for (const [name, stats] of Object.entries(byInterface)) {
          if (actualDownloadTime > 0 && stats.bytes > 0) {
            // Speed = bytes downloaded / wall-clock time
            // This represents the actual throughput of this interface during the download
            interfaceSpeeds[name] = (stats.bytes / actualDownloadTime);
          }
        }

        if (Object.keys(interfaceSpeeds).length > 0) {
          // Find fastest interface
          let fastestInterface = null;
          let fastestSpeed = 0;
          for (const [name, speed] of Object.entries(interfaceSpeeds)) {
            if (speed > fastestSpeed) {
              fastestSpeed = speed;
              fastestInterface = name;
            }
          }

          if (fastestInterface && fastestSpeed > 0) {
            // Calculate how long it would have taken with just the fastest interface
            const singleInterfaceTime = totalBytes / fastestSpeed;
            
            const timeSaved = singleInterfaceTime - actualDownloadTime;
            const speedupFactor = singleInterfaceTime / actualDownloadTime;
            const timeSavedPct = ((timeSaved / singleInterfaceTime) * 100);

            if (timeSaved > 0) {
              // Store report data for saving
              reportData = {
                downloadId: item.id,
                timestamp: item.timestamp,
                timeSaved: timeSaved,
                singleInterfaceTime: singleInterfaceTime,
                actualDownloadTime: actualDownloadTime,
                fastestInterface: fastestInterface,
                interfaceCount: Object.keys(byInterface).length,
                speedupFactor: speedupFactor,
                timeSavedPct: timeSavedPct,
                totalBytes: totalBytes,
                interfaceSpeeds: interfaceSpeeds,
                byInterface: byInterface
              };

              // Save report data to file
              const reportPath = `${item.outputDir}/report.json`;
              try {
                await window.mush.writeReportFile(reportPath, JSON.stringify(reportData, null, 2));
              } catch (err) {
                console.error('Failed to save report:', err);
              }

              const formatTime = (sec) => {
                if (sec < 60) return sec.toFixed(1) + 's';
                const mins = Math.floor(sec / 60);
                const secs = Math.floor(sec % 60);
                if (mins < 60) return `${mins}m ${secs}s`;
                const hours = Math.floor(mins / 60);
                const remainMins = mins % 60;
                return `${hours}h ${remainMins}m`;
              };

              timeSavedHtml = `
                <div class="report-section time-saved-section">
                  <h4>Multi-Interface Performance Gain</h4>
                  <div class="time-saved-highlight">
                    <div class="time-saved-main">
                      <span class="time-saved-label">Time Saved:</span>
                      <span class="time-saved-value">${formatTime(timeSaved)}</span>
                    </div>
                    <div class="time-saved-details">
                      <div class="time-saved-metric">
                        <span>Single Interface (${escapeHtml(fastestInterface)}):</span>
                        <span>${formatTime(singleInterfaceTime)}</span>
                      </div>
                      <div class="time-saved-metric">
                        <span>Multi-Interface (${Object.keys(byInterface).length} interfaces):</span>
                        <span>${formatTime(actualDownloadTime)}</span>
                      </div>
                      <div class="time-saved-metric">
                        <span>Speedup Factor:</span>
                        <span>${speedupFactor.toFixed(2)}x faster</span>
                      </div>
                      <div class="time-saved-metric">
                        <span>Efficiency Gain:</span>
                        <span>${timeSavedPct.toFixed(1)}% reduction</span>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }
          }
        }
      }

      reportBody.innerHTML = `
        <div class="report-section">
          <div class="report-metric"><span>Total Size</span><span>${(totalBytes / 1024 / 1024).toFixed(2)} MB</span></div>
          <div class="report-metric"><span>Duration</span><span>${durationStr}</span></div>
          <div class="report-metric"><span>Avg Speed</span><span>${avgSpeedTotal}</span></div>
          <div class="report-metric"><span>Chunks</span><span>${totalChunks}</span></div>
          <div class="report-metric"><span>Errors</span><span>${errors}</span></div>
        </div>
        ${timeSavedHtml}
        ${phaseTimingsHtml}
        <div class="report-section">
          <h4>Interface Breakdown</h4>
          <table class="report-table">
            <thead><tr><th>Interface</th><th>Chunks</th><th>Bytes</th><th>Est. Speed</th></tr></thead>
            <tbody>${ifaceRows}</tbody>
          </table>
        </div>
      `;
    } catch (e) {
      reportBody.innerHTML = 'Error parsing execution report: ' + e.message;
    }
  };


  // Expose for onClick
  window.openFile = async (id) => {
    const history = await window.mush.getHistory();
    const item = history.find(h => String(h.id) === String(id));
    if (item) {
      const root = await window.mush.getProjectRoot();
      const p = item.path;
      const fullPath = (p && p.startsWith('/')) ? p : (root + '/' + p);
      if (item.status === 'Completed') {
        await window.mush.openHistoryFile(fullPath);
      }
    }
  };

  window.deleteHistory = async (id) => {
    const newHistory = await window.mush.deleteHistoryItem(Number(id));
    renderHistory(newHistory);
  };

  document.getElementById('refreshHistory').addEventListener('click', () => renderHistory());
  document.getElementById('historyFilter').addEventListener('input', () => renderHistory());

  // Initial load
  renderHistory();

  // ——— Analytics: load JSON and draw charts per interface ———

  function updateElapsedAndEta() {
    if (!phase8StartTime || !streaming) return;
    const elapsedSec = (Date.now() - phase8StartTime) / 1000;
    elapsedText.textContent = 'Elapsed: ' + formatDuration(elapsedSec);
  }

  function formatDuration(seconds) {
    if (seconds < 60) return seconds.toFixed(1) + 's';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins < 60) return `${mins}:${secs.toString().padStart(2, '0')}`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function renderPerInterface() {
    const names = Object.keys(phase8Totals.perInterface).sort();
    if (names.length === 0) {
      progressPerInterface.innerHTML = '';
      return;
    }
    progressPerInterface.innerHTML = names.map((name) => {
      const total = phase8Totals.perInterface[name] || 0;
      const done = phase8CompletedPerInterface[name] || 0;
      const pct = total > 0 ? Math.min(100, (100 * done) / total) : 0;
      return '<div class="iface-row">' +
        '<span class="iface-name">' + escapeHtml(name) + '</span>' +
        '<div class="iface-bar-wrap"><div class="iface-bar" style="width:' + pct + '%"></div></div>' +
        '<span class="iface-count">' + done + ' / ' + total + '</span>' +
        '</div>';
    }).join('');
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function showProgress(current, total) {
    progressArea.style.display = 'block';
    phase8Current = current;
    const pct = total > 0 ? Math.min(100, (100 * current) / total) : 0;
    progressBar.style.width = pct + '%';
    progressText.textContent = current + ' / ' + total + ' chunks';
    updateElapsedAndEta();
    renderPerInterface();
  }

  function hideProgress() {
    progressArea.style.display = 'none';
    progressBar.style.width = '0%';
    progressText.textContent = '0 / 0 chunks';
    elapsedText.textContent = 'Elapsed: 0:00';
    progressText.textContent = '0 / 0 chunks';
    elapsedText.textContent = 'Elapsed: 0:00';
    progressPerInterface.innerHTML = '';
    phase8StartTime = null;
    phase8Totals = { total: 0, perInterface: {} };
    phase8Current = 0;
    phase8CompletedPerInterface = {};
    if (elapsedInterval) {
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    }
  }

  btnStop.addEventListener('click', () => {
    if (streaming) window.mush.stopPhase();
  });
  btnPause.addEventListener('click', () => {
    if (streaming) window.mush.pausePhase();
  });
  btnResume.addEventListener('click', () => {
    if (streaming) window.mush.resumePhase();
  });

  window.mush.onPhaseEvent((ev) => {
    if (ev.type === 'output') {
      logBuffer += ev.chunk || '';
      logEl.textContent = logBuffer;
      logEl.scrollTop = logEl.scrollHeight;
    } else if (ev.type === 'phase8_totals') {
      phase8Totals = { total: ev.total || 0, perInterface: ev.perInterface || {} };
      phase8CompletedPerInterface = {};
      Object.keys(phase8Totals.perInterface).forEach((name) => { phase8CompletedPerInterface[name] = 0; });
      renderPerInterface();
    } else if (ev.type === 'chunk_done') {
      const name = ev.interface_name;
      if (name) phase8CompletedPerInterface[name] = (phase8CompletedPerInterface[name] || 0) + 1;
      renderPerInterface();
    } else if (ev.type === 'progress') {
      if (!phase8StartTime) {
        phase8StartTime = Date.now();
        if (!elapsedInterval) elapsedInterval = setInterval(updateElapsedAndEta, 1000);
      }
      showProgress(ev.current || 0, ev.total || 0);
    } else if (ev.type === 'exit') {
      lastPhase8ExitCode = ev.code ?? -1;
      const ok = lastPhase8ExitCode === 0;
      logBuffer += '\n\n[Phase 8] ' + (ok ? 'OK' : 'Failed' + (ev.error ? ': ' + ev.error : ' (code ' + lastPhase8ExitCode + ')'));
      logEl.textContent = logBuffer;
      logEl.className = ok ? 'ok' : 'err';
      hideProgress();
      setStreamingControls(false);
      running = false;
      if (activeHistoryId) {
        const status = ok ? 'Completed' : 'Failed';
        const phase8Duration = window.phase8HistoryStartTime ? (Date.now() - window.phase8HistoryStartTime) / 1000 : 0;
        const updates = { status };
        if (phase8Duration > 0) {
          updates.duration = phase8Duration;
          updates.phaseTimings = { phase8: phase8Duration };
        }
        window.mush.updateHistoryItem(activeHistoryId, updates).then(h => renderHistory(h));
        activeHistoryId = null;
        window.phase8HistoryStartTime = null;
      }
      if (phase8ExitResolve) {
        phase8ExitResolve();
        phase8ExitResolve = null;
      }
    }
  });

  document.querySelectorAll('.phases [data-phase]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (running) return;
      const phaseVal = btn.dataset.phase;
      const opts = getFormOptions();
      document.getElementById('statusOutputDir').textContent = opts.outputDir;
      document.getElementById('statusPhase').textContent = phaseVal === 'full' ? '1→9' : `Phase ${phaseVal}`;

      if (phaseVal === 'full') {
        running = true;
        let fullLog = '';
        const phaseTimings = {};
        
        for (let p = 1; p <= 7; p++) {
          const res = await window.mush.runPhase(p, opts);
          phaseTimings[`phase${p}`] = res.duration || 0;
          fullLog += `$ Phase ${p}\n${res.log}\n\n[Phase ${p}] ${res.code === 0 ? 'OK' : 'Failed'} (${(res.duration || 0).toFixed(2)}s)\n\n`;
          logEl.textContent = fullLog;
          logEl.scrollTop = logEl.scrollHeight;
          if (res.code !== 0) {
            running = false;
            return;
          }
        }
        // Phase 8: streamed with progress and controls
        // Create History Entry
        const historyId = Date.now();
        const historyItem = {
          id: historyId,
          url: opts.url,
          filename: opts.outputFilename || 'download.bin',
          path: opts.outputDir + '/' + (opts.outputFilename || 'download.bin'),
          status: 'Running',
          outputDir: opts.outputDir,
          date: new Date().toISOString(),
          phaseTimings: phaseTimings,
        };
        const hAdded = await window.mush.addToHistory(historyItem);
        renderHistory(hAdded);

        const phase8StartTime = Date.now();
        const startRes = await window.mush.startPhaseStream(8, opts);
        if (!startRes.started) {
          fullLog += (startRes.error || 'Failed to start phase 8') + '\n';
          logEl.textContent = fullLog;
          running = false;
          const hFailed = await window.mush.updateHistoryItem(historyId, { status: 'Failed', duration: (Date.now() - phase8StartTime) / 1000 });
          renderHistory(hFailed);
          return;
        }
        fullLog += '$ Phase 8 (streaming)\n';
        logBuffer = fullLog;
        logEl.textContent = logBuffer;
        setStreamingControls(true);
        phase8Totals = { total: 0, perInterface: {} };
        phase8CompletedPerInterface = {};
        showProgress(0, 0);
        await new Promise((resolve) => { phase8ExitResolve = resolve; });
        const phase8Duration = (Date.now() - phase8StartTime) / 1000;
        phaseTimings.phase8 = phase8Duration;
        
        if (lastPhase8ExitCode !== 0) {
          running = false;
          const hExited = await window.mush.updateHistoryItem(historyId, { 
            status: 'Failed', 
            duration: phase8Duration,
            phaseTimings: phaseTimings 
          });
          renderHistory(hExited);
          return;
        }
        
        const res9 = await window.mush.runPhase(9, opts);
        phaseTimings.phase9 = res9.duration || 0;
        const totalDuration = Object.values(phaseTimings).reduce((sum, t) => sum + t, 0);
        
        fullLog = logBuffer + `\n$ Phase 9\n${res9.log}\n\n[Phase 9] ${res9.code === 0 ? 'OK' : 'Failed'} (${(res9.duration || 0).toFixed(2)}s)\n`;
        logEl.textContent = fullLog;
        logEl.className = res9.code === 0 ? 'ok' : 'err';
        running = false;
        const hFinal = await window.mush.updateHistoryItem(historyId, { 
          status: res9.code === 0 ? 'Completed' : 'Failed', 
          duration: totalDuration,
          phaseTimings: phaseTimings
        });
        renderHistory(hFinal);
        return;
      }

      const phase = parseInt(phaseVal, 10);
      if (Number.isNaN(phase)) return;

      if (phase === 8) {
        running = true;

        // Create History Entry for manual Phase 8 run
        const historyId = Date.now();
        activeHistoryId = historyId; // Track for onPhaseEvent updates
        const historyItem = {
          id: historyId,
          url: opts.url,
          filename: opts.outputFilename || 'download.bin',
          path: opts.outputDir + '/' + (opts.outputFilename || 'download.bin'),
          status: 'Running',
          outputDir: opts.outputDir,
          date: new Date().toISOString(),
          phaseTimings: {},
        };
        const hAdded = await window.mush.addToHistory(historyItem);
        renderHistory(hAdded);

        const phase8StartTime = Date.now();
        const startRes = await window.mush.startPhaseStream(8, opts);
        if (!startRes.started) {
          logEl.textContent = (startRes.error || 'Failed to start') + '\n';
          logEl.className = 'err';
          running = false;
          // Mark as failed immediately
          window.mush.updateHistoryItem(historyId, { status: 'Failed' }).then(h => renderHistory(h));
          activeHistoryId = null;
          return;
        }
        logBuffer = '$ Phase 8\n';
        logEl.textContent = logBuffer;
        setStreamingControls(true);
        phase8Totals = { total: 0, perInterface: {} };
        phase8CompletedPerInterface = {};
        showProgress(0, 0);
        
        // Store start time for duration calculation in exit handler
        window.phase8HistoryStartTime = phase8StartTime;
        return;
      }

      running = true;
      logEl.textContent = 'Running…';
      logEl.className = '';
      try {
        const res = await window.mush.runPhase(phase, opts);
        const ok = res.code === 0;
        logEl.textContent = (res.log || '(no output)') + '\n\n[Phase ' + phase + '] ' + (ok ? 'OK' : 'Failed');
        logEl.className = ok ? 'ok' : 'err';
      } finally {
        running = false;
      }
    });
  });

  // ——— Analytics: load JSON and draw charts per interface ———
  let analyticsData = { measurements: null, predictions: null, interfaces: [] };
  let lastByIface = null;
  let lastAnalyticsOutputDir = null;
  let liveRefreshInterval = null;

  document.getElementById('loadAnalytics').addEventListener('click', loadAnalytics);

  document.getElementById('analyticsLive').addEventListener('change', (e) => {
    if (e.target.checked) {
      if (!lastByIface) loadAnalytics();
      liveRefreshInterval = setInterval(refreshAnalyticsLive, 3000);
    } else {
      if (liveRefreshInterval) clearInterval(liveRefreshInterval);
      liveRefreshInterval = null;
    }
  });

  async function refreshAnalyticsLive() {
    if (!lastByIface || !lastAnalyticsOutputDir) return;
    const rawMeasurements = await window.mush.readOutputFile(lastAnalyticsOutputDir, 'measurements.json');
    const rawPredictions = await window.mush.readOutputFile(lastAnalyticsOutputDir, 'predictions.json');
    if (!rawMeasurements) return;
    try {
      analyticsData.measurements = JSON.parse(rawMeasurements);
      analyticsData.predictions = rawPredictions ? JSON.parse(rawPredictions) : null;
    } catch (_) { return; }
    const byIface = (analyticsData.measurements.measurements || []).reduce((acc, m) => {
      const id = m.interface_id;
      if (!acc[id]) acc[id] = { name: m.interface_name || 'Interface ' + id, points: [] };
      acc[id].points.push(m);
      return acc;
    }, {});
    lastByIface = byIface;
    const currentId = interfaceSelect.value;
    if (currentId && byIface[currentId]) drawInterfaceCharts(currentId, byIface);
  }

  async function loadAnalytics() {
    const outputDir = document.getElementById('analyticsOutputDir').value.trim() || document.getElementById('outputDir').value.trim() || 'outputs';
    const rawMeasurements = await window.mush.readOutputFile(outputDir, 'measurements.json');
    const rawPredictions = await window.mush.readOutputFile(outputDir, 'predictions.json');
    const rawInterfaces = await window.mush.readOutputFile(outputDir, 'interfaces.json');

    if (!rawMeasurements) {
      analyticsEmpty.textContent = 'No measurements.json in ' + outputDir + '. Run phases 1–5 first.';
      analyticsEmpty.style.display = 'block';
      analyticsCharts.innerHTML = '';
      return;
    }

    try {
      analyticsData.measurements = JSON.parse(rawMeasurements);
      analyticsData.predictions = rawPredictions ? JSON.parse(rawPredictions) : null;
      analyticsData.interfaces = rawInterfaces ? (JSON.parse(rawInterfaces).interfaces || []) : [];
    } catch (e) {
      analyticsEmpty.textContent = 'Invalid JSON: ' + e.message;
      analyticsEmpty.style.display = 'block';
      return;
    }

    const byIface = (analyticsData.measurements.measurements || []).reduce((acc, m) => {
      const id = m.interface_id;
      if (!acc[id]) acc[id] = { name: m.interface_name || 'Interface ' + id, points: [] };
      acc[id].points.push(m);
      return acc;
    }, {});

    lastByIface = byIface;
    lastAnalyticsOutputDir = outputDir;

    const ids = Object.keys(byIface).sort((a, b) => Number(a) - Number(b));
    interfaceSelect.innerHTML = '<option value="">— Select interface —</option>' +
      ids.map((id) => `<option value="${id}">${byIface[id].name} (${id})</option>`).join('');

    analyticsEmpty.style.display = 'none';
    analyticsCharts.innerHTML = '';
    interfaceSelect.onchange = () => drawInterfaceCharts(interfaceSelect.value, lastByIface);
    if (ids.length) {
      interfaceSelect.value = ids[0];
      drawInterfaceCharts(ids[0], byIface);
    }

    if (document.getElementById('analyticsLive').checked && !liveRefreshInterval) {
      liveRefreshInterval = setInterval(refreshAnalyticsLive, 3000);
    }
  }

  const chartInstances = [];

  function drawInterfaceCharts(interfaceId, byIface) {
    chartInstances.forEach((c) => c.destroy());
    chartInstances.length = 0;
    analyticsCharts.innerHTML = '';

    if (!interfaceId || !byIface[interfaceId]) return;

    const points = byIface[interfaceId].points.sort((a, b) => (a.interval_number || 0) - (b.interval_number || 0));
    const labels = points.map((p) => 'T' + (p.interval_number ?? p.timestamp ?? ''));

    const grid = { color: '#3c3c3c' };
    const blue = 'rgb(0, 122, 204)';
    const green = 'rgb(78, 201, 176)';
    const orange = 'rgb(230, 180, 80)';

    // Throughput (goodput_mbps)
    const throughputData = points.map((p) => (p.throughput && p.throughput.goodput_mbps != null) ? p.throughput.goodput_mbps : 0);
    const throughputCtx = document.createElement('canvas');
    throughputCtx.height = 240;
    const wrap1 = document.createElement('div');
    wrap1.className = 'chart-container';
    wrap1.innerHTML = '<h4>Throughput (Mbps)</h4>';
    wrap1.appendChild(throughputCtx);
    analyticsCharts.appendChild(wrap1);
    chartInstances.push(new Chart(throughputCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Goodput (Mbps)', data: throughputData, borderColor: blue, backgroundColor: blue + '20', fill: true, tension: 0.2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { grid }, y: { beginAtZero: true, grid } },
        plugins: { legend: { display: false } },
      },
    }));

    // Latency (rtt_mean_ms)
    const latencyData = points.map((p) => (p.latency && p.latency.rtt_mean_ms != null) ? p.latency.rtt_mean_ms : 0);
    const latencyCtx = document.createElement('canvas');
    const wrap2 = document.createElement('div');
    wrap2.className = 'chart-container';
    wrap2.innerHTML = '<h4>Latency (RTT mean ms)</h4>';
    wrap2.appendChild(latencyCtx);
    analyticsCharts.appendChild(wrap2);
    chartInstances.push(new Chart(latencyCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'RTT mean (ms)', data: latencyData, borderColor: green, backgroundColor: green + '20', fill: true, tension: 0.2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { grid }, y: { beginAtZero: true, grid } },
        plugins: { legend: { display: false } },
      },
    }));

    // Loss rate
    const lossData = points.map((p) => (p.loss && p.loss.loss_rate_percent != null) ? p.loss.loss_rate_percent : 0);
    const lossCtx = document.createElement('canvas');
    const wrap3 = document.createElement('div');
    wrap3.className = 'chart-container';
    wrap3.innerHTML = '<h4>Loss rate (%)</h4>';
    wrap3.appendChild(lossCtx);
    analyticsCharts.appendChild(wrap3);
    chartInstances.push(new Chart(lossCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Loss %', data: lossData, borderColor: orange, backgroundColor: orange + '20', fill: true, tension: 0.2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { grid }, y: { beginAtZero: true, grid } },
        plugins: { legend: { display: false } },
      },
    }));

    // Predictions summary for this interface (if available)
    if (analyticsData.predictions && analyticsData.predictions.models) {
      const model = analyticsData.predictions.models.find((m) => String(m.interface_id) === String(interfaceId));
      if (model && model.predictions) {
        const predDiv = document.createElement('div');
        predDiv.className = 'chart-container';
        predDiv.style.height = 'auto';
        predDiv.innerHTML = '<h4>Predictions (current)</h4><pre style="margin:0; font-size:11px; color: var(--text-muted);">' +
          'Throughput: ' + (model.predictions.predicted_throughput_mbps != null ? model.predictions.predicted_throughput_mbps.toFixed(4) : '—') + ' Mbps\n' +
          'Latency: ' + (model.predictions.predicted_latency_ms != null ? model.predictions.predicted_latency_ms.toFixed(2) : '—') + ' ms\n' +
          'Loss: ' + (model.predictions.predicted_loss_rate != null ? model.predictions.predicted_loss_rate : '—') + '%\n' +
          'Stability: ' + (model.stability_metrics && model.stability_metrics.stability_score != null ? model.stability_metrics.stability_score.toFixed(4) : '—') +
          '</pre>';
        analyticsCharts.appendChild(predDiv);
      }
    }
  }

  // Load first test case as defaults (then user can "Fetch metadata" for filename/size)
  (async function loadDefaults() {
    try {
      const tc = await window.mush.getTestCases();
      if (tc) {
        if (tc.url) document.getElementById('url').value = tc.url;
        if (tc.content_length != null) document.getElementById('fileSize').value = String(tc.content_length);
        if (tc.ip && tc.port != null) document.getElementById('dest').value = tc.ip + ':' + tc.port;
        metadataStatus.textContent = 'Default loaded from test_cases.json. Click "Fetch metadata" to get filename and size from URL.';
        metadataStatus.className = 'metadata-status';
      }
    } catch (_) { }
    document.getElementById('statusOutputDir').textContent = 'outputs';
  })();
})();
