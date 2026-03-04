const { contextBridge, ipcRenderer } = require('electron');

let phaseEventCallback = null;
ipcRenderer.on('phase-event', (_, payload) => {
  if (phaseEventCallback) phaseEventCallback(payload);
});

contextBridge.exposeInMainWorld('mush', {
  runPhase: (phase, options) => ipcRenderer.invoke('runPhase', phase, options),
  startPhaseStream: (phase, options) => ipcRenderer.invoke('startPhaseStream', phase, options),
  stopPhase: () => ipcRenderer.invoke('stopPhase'),
  pausePhase: () => ipcRenderer.invoke('pausePhase'),
  resumePhase: () => ipcRenderer.invoke('resumePhase'),
  onPhaseEvent: (cb) => { phaseEventCallback = cb; },
  fetchMetadata: (url) => ipcRenderer.invoke('fetchMetadata', url),
  readOutputFile: (outputDir, filename) => ipcRenderer.invoke('readOutputFile', outputDir, filename),
  writeReportFile: (filepath, content) => ipcRenderer.invoke('writeReportFile', filepath, content),
  getProjectRoot: () => ipcRenderer.invoke('getProjectRoot'),
  getTestCases: () => ipcRenderer.invoke('getTestCases'),
  getHistory: () => ipcRenderer.invoke('getHistory'),
  addToHistory: (item) => ipcRenderer.invoke('addToHistory', item),
  updateHistoryItem: (id, updates) => ipcRenderer.invoke('updateHistoryItem', id, updates),
  deleteHistoryItem: (id) => ipcRenderer.invoke('deleteHistoryItem', id),
  openHistoryFile: (filepath) => ipcRenderer.invoke('openHistoryFile', filepath),
  showItemInFolder: (filepath) => ipcRenderer.invoke('showItemInFolder', filepath),
});
