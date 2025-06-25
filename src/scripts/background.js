class TaskTimeTracker {
  constructor() {
    this.activeTimers = new Map();
    this.lastActivity = Date.now();
    this.setupMessageHandlers();
    this.setupStorageDefaults();
    this.setupPeriodicChecks();
    // webRequest監視は削除（Chrome Web Store審査対応）
    this.restoreActiveTimers();
  }

  getTaskKey(service, taskId, issueKey = null, spaceId = null) {
    if (service === 'backlog' && spaceId && issueKey) {
      return `${spaceId}_${issueKey}`;
    }
    return taskId;
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      
      switch (message.type) {
        case 'TASK_STATUS_CHANGED':
          this.handleTaskStatusChange(message.data, sender.tab);
          sendResponse({ success: true, message: 'Status change processed' });
          break;
        case 'GET_TIMER_STATUS':
          this.getTimerStatus(message.taskId, message.service, message.issueKey, message.spaceId, sendResponse);
          return true;
        case 'GET_TIME_SUMMARY':
          this.getTimeSummary(sendResponse);
          return true;
        case 'UPDATE_SETTINGS':
          this.updateSettings(message.settings);
          sendResponse({ success: true, message: 'Settings updated' });
          break;
        case 'HEARTBEAT':
          this.lastActivity = Date.now();
          sendResponse({ success: true, message: 'Heartbeat received' });
          break;
        case 'STOP_TIMER':
          const timerKey = this.getTaskKey(message.service, message.taskId, message.issueKey, message.spaceId);
          this.stopTimer(timerKey);
          sendResponse({ success: true, message: 'Timer stopped' });
          break;
        case 'CLEAR_ALL_TIMERS':
          this.clearAllTimers();
          sendResponse({ success: true, message: 'All timers cleared' });
          break;
        case 'GET_ACTIVE_TIMERS':
          this.getActiveTimers(sendResponse);
          return true;
        case 'GET_SETTINGS':
          this.getSettingsForContentScript(sendResponse);
          return true;
        case 'TASK_INITIALIZED':
          this.handleTaskInitialized(message.data);
          sendResponse({ success: true, message: 'Task initialization received' });
          break;
        default:
          sendResponse({ success: false, message: 'Unknown message type' });
      }
    });
  }

  async setupStorageDefaults() {
    const defaults = {
      settings: {
        trackingStatuses: {
          backlog: {
            start: ['処理中']
          },
          github: {
            start: ['now']
          }
        },
        excludeInactiveTime: true
      },
      timeLogs: [],
      activeTimers: {}
    };

    const stored = await chrome.storage.local.get(['settings']);
    if (!stored.settings) {
      await chrome.storage.local.set(defaults);
    }
  }


  async handleTaskStatusChange(data, tab) {
    const { taskId, newStatus, oldStatus, service, taskTitle, projectName, issueKey, spaceId } = data;
    const timerKey = this.getTaskKey(service, taskId, issueKey, spaceId);
    
    
    this.lastActivity = Date.now();
    
    const settings = await this.getSettings();
    const serviceSettings = settings.trackingStatuses[service];

    if (!serviceSettings) {
      return;
    }

    const isStartStatus = serviceSettings.start.includes(newStatus);
    const wasStartStatus = oldStatus && serviceSettings.start.includes(oldStatus);

    if (isStartStatus && !this.activeTimers.has(timerKey)) {
      await this.startTimer(timerKey, {
        service,
        taskTitle,
        projectName,
        issueKey,
        spaceId,
        taskId,
        startTime: Date.now(),
        tabId: tab?.id
      });
    } else if (wasStartStatus && !isStartStatus && this.activeTimers.has(timerKey)) {
      await this.stopTimer(timerKey);
    } else if (isStartStatus && this.activeTimers.has(timerKey)) {
    } else if (!isStartStatus && !this.activeTimers.has(timerKey)) {
    }

    this.updateBadge();
  }

  async handleTaskInitialized(data) {
    const { taskId, status, service, taskTitle, issueKey, spaceId } = data;
    const timerKey = this.getTaskKey(service, taskId, issueKey, spaceId);
    
    if (this.activeTimers.has(timerKey)) {
      const settings = await this.getSettings();
      const serviceSettings = settings.trackingStatuses[service];
      if (serviceSettings && !serviceSettings.start.includes(status)) {
        await this.stopTimer(timerKey);
      }
    }
  }

  async startTimer(timerKey, timerData) {
    // 重複開始チェック
    if (this.activeTimers.has(timerKey)) {
      return;
    }

    this.activeTimers.set(timerKey, timerData);
    
    await chrome.storage.local.set({
      activeTimers: Object.fromEntries(this.activeTimers)
    });

    const settings = await this.getSettings();

  }

  async stopTimer(timerKey) {
    const timer = this.activeTimers.get(timerKey);
    if (!timer) {
      return;
    }


    const endTime = Date.now();
    const duration = endTime - timer.startTime;

    const timeLog = {
      id: `${timerKey}_${timer.startTime}`,
      taskId: timer.taskId || timerKey,
      service: timer.service,
      taskTitle: timer.taskTitle,
      projectName: timer.projectName,
      issueKey: timer.issueKey,
      spaceId: timer.spaceId,
      startTime: timer.startTime,
      endTime,
      duration,
      date: new Date().toDateString()
    };

    const { timeLogs = [] } = await chrome.storage.local.get(['timeLogs']);
    timeLogs.push(timeLog);

    this.activeTimers.delete(timerKey);

    await chrome.storage.local.set({
      timeLogs,
      activeTimers: Object.fromEntries(this.activeTimers)
    });

    const settings = await this.getSettings();

  }

  async pauseTimer(timerKey) {
    const timer = this.activeTimers.get(timerKey);
    if (!timer) return;

    this.activeTimers.delete(timerKey);
    await chrome.storage.local.set({
      activeTimers: Object.fromEntries(this.activeTimers)
    });
  }

  async getTimerStatus(taskId, service, issueKey, spaceId, sendResponse) {
    const timerKey = this.getTaskKey(service, taskId, issueKey, spaceId);
    const timer = this.activeTimers.get(timerKey);
    sendResponse({
      isActive: !!timer,
      startTime: timer?.startTime,
      currentDuration: timer ? Date.now() - timer.startTime : 0
    });
  }

  async getTimeSummary(sendResponse) {
    const { timeLogs = [] } = await chrome.storage.local.get(['timeLogs']);
    const today = new Date().toDateString();
    const thisWeek = this.getWeekStart(new Date()).toDateString();

    // 今日のログをタスクタイトル別にグループ化
    const todayLogs = timeLogs.filter(log => log.date === today);
    const todayByTask = this.groupLogsByTaskTitle(todayLogs);

    // 今週のログをタスクタイトル別にグループ化
    const thisWeekLogs = timeLogs.filter(log => 
      new Date(log.date) >= new Date(thisWeek)
    );
    const thisWeekByTask = this.groupLogsByTaskTitle(thisWeekLogs);

    const summary = {
      today: this.calculateDuration(todayLogs),
      thisWeek: this.calculateDuration(thisWeekLogs),
      todayByTask,
      thisWeekByTask,
      activeTimers: Array.from(this.activeTimers.entries()).map(([timerKey, timer]) => ({
        taskId: timer.taskId || timerKey,
        timerKey,
        taskTitle: timer.taskTitle,
        service: timer.service,
        projectName: timer.projectName,
        issueKey: timer.issueKey,
        spaceId: timer.spaceId,
        duration: Date.now() - timer.startTime
      }))
    };

    sendResponse(summary);
  }

  groupLogsByTaskTitle(logs) {
    const grouped = {};
    
    logs.forEach(log => {
      const taskTitle = log.taskTitle || 'Unknown Task';
      if (!grouped[taskTitle]) {
        grouped[taskTitle] = {
          taskTitle,
          taskId: log.taskId,
          service: log.service,
          projectName: log.projectName,
          issueKey: log.issueKey,
          spaceId: log.spaceId,
          totalDuration: 0,
          sessions: []
        };
      }
      
      grouped[taskTitle].totalDuration += log.duration;
      grouped[taskTitle].sessions.push({
        startTime: log.startTime,
        endTime: log.endTime,
        duration: log.duration,
        date: log.date
      });
    });

    // 合計時間でソート（降順）
    return Object.values(grouped).sort((a, b) => b.totalDuration - a.totalDuration);
  }

  async restoreActiveTimers() {
    try {
      const { activeTimers = {} } = await chrome.storage.local.get(['activeTimers']);
      
      Object.entries(activeTimers).forEach(([timerKey, timerData]) => {
        // タイマーが24時間以上古い場合は削除
        const hoursSinceStart = (Date.now() - timerData.startTime) / (1000 * 60 * 60);
        if (hoursSinceStart > 24) {
            return;
        }
        
        this.activeTimers.set(timerKey, timerData);
      });
      
      this.updateBadge();
    } catch (error) {
    }
  }

  setupPeriodicChecks() {
    // 5分ごとにタイマーの状態をチェック
    setInterval(() => {
      this.performPeriodicCheck();
    }, 5 * 60 * 1000);

    // 1分ごとにアクティビティをチェック
    setInterval(() => {
      this.checkActivity();
    }, 60 * 1000);
  }

  async performPeriodicCheck() {
    
    // ストレージと同期
    await chrome.storage.local.set({
      activeTimers: Object.fromEntries(this.activeTimers)
    });
    
    // 各タイマーの状態をログ出力
    this.activeTimers.forEach((timer, timerKey) => {
      const duration = Date.now() - timer.startTime;
    });
    
    this.updateBadge();
  }

  checkActivity() {
    // 非アクティブ時間の検出（設定で有効な場合）
    const inactiveThreshold = 30 * 60 * 1000; // 30分
    const now = Date.now();
    
    if (now - this.lastActivity > inactiveThreshold) {
      // 必要に応じてタイマーを一時停止する処理を追加
    }
    
    this.lastActivity = now;
  }

  async getSettings() {
    const { settings } = await chrome.storage.local.get(['settings']);
    return settings;
  }

  async updateSettings(newSettings) {
    await chrome.storage.local.set({ settings: newSettings });
  }

  async updateBadge() {
    const previousCount = this.previousBadgeCount || 0;
    const activeCount = this.activeTimers.size;
    
    chrome.action.setBadgeText({
      text: activeCount > 0 ? activeCount.toString() : ''
    });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    
    // バッジカウントが変更された場合
    if (previousCount !== activeCount) {
      this.previousBadgeCount = activeCount;
    }
  }




  calculateDuration(logs) {
    return logs.reduce((total, log) => total + log.duration, 0);
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}時間${minutes % 60}分`;
    } else if (minutes > 0) {
      return `${minutes}分`;
    } else {
      return `${seconds}秒`;
    }
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day;
    return new Date(d.setDate(diff));
  }

  async clearAllTimers() {
    
    // 各タイマーを停止してログに記録
    const clearedTimers = [];
    for (const [timerKey, timer] of this.activeTimers) {
      const endTime = Date.now();
      const duration = endTime - timer.startTime;

      const timeLog = {
        id: `${timerKey}_${timer.startTime}`,
        taskId: timer.taskId || timerKey,
        service: timer.service,
        taskTitle: timer.taskTitle,
        projectName: timer.projectName,
        issueKey: timer.issueKey,
        spaceId: timer.spaceId,
        startTime: timer.startTime,
        endTime,
        duration,
        date: new Date().toDateString(),
        note: 'Manually cleared'
      };

      clearedTimers.push(timeLog);
    }

    // ログを保存
    if (clearedTimers.length > 0) {
      const { timeLogs = [] } = await chrome.storage.local.get(['timeLogs']);
      timeLogs.push(...clearedTimers);
      await chrome.storage.local.set({ timeLogs });
    }

    // タイマーをクリア
    this.activeTimers.clear();
    await chrome.storage.local.set({
      activeTimers: {}
    });

    this.updateBadge();
  }
  
  async getActiveTimers(sendResponse) {
    const activeTimersObj = Object.fromEntries(this.activeTimers);
    
    sendResponse({
      success: true,
      activeTimers: activeTimersObj
    });
  }
  
  async getSettingsForContentScript(sendResponse) {
    
    try {
      const settings = await this.getSettings();
      
      sendResponse({
        success: true,
        settings: settings
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  // webRequest関連の機能は削除（Chrome Web Store審査対応）
  // DOM監視ベースの検知機能で十分に動作するため

}

// Service Worker startup/install events
chrome.runtime.onStartup.addListener(() => {
  new TaskTimeTracker();
});

chrome.runtime.onInstalled.addListener(() => {
  new TaskTimeTracker();
});

// Always initialize on script load
new TaskTimeTracker();