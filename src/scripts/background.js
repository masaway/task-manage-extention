class TaskTimeTracker {
  constructor() {
    this.activeTimers = new Map();
    this.lastActivity = Date.now();
    this.setupMessageHandlers();
    this.setupStorageDefaults();
    this.setupPeriodicChecks();
    this.setupWebRequestListeners();
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
      console.log('[Background] Received message:', message.type, message.data);
      console.log('[Background] Sender tab:', sender.tab?.id, sender.tab?.url);
      
      switch (message.type) {
        case 'TASK_STATUS_CHANGED':
          console.log('[Background] Processing TASK_STATUS_CHANGED:', message.data);
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
          console.log(`[Background] Heartbeat received from ${message.data.url}`);
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
          console.log('[Background] Unknown message type:', message.type);
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
        notifications: true,
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
      console.log(`[Background] No settings found for service: ${service}`);
      return;
    }

    const isStartStatus = serviceSettings.start.includes(newStatus);
    const wasStartStatus = oldStatus && serviceSettings.start.includes(oldStatus);

    if (isStartStatus && !this.activeTimers.has(timerKey)) {
      console.log(`[Background] Timer started: ${issueKey}`);
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
      console.log(`[Background] Timer stopped: ${issueKey}`);
      await this.stopTimer(timerKey);
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
        console.log(`[Background] Stopping orphaned timer: ${issueKey} (${status})`);
        await this.stopTimer(timerKey);
      }
    }
  }

  async startTimer(timerKey, timerData) {
    this.activeTimers.set(timerKey, timerData);
    
    await chrome.storage.local.set({
      activeTimers: Object.fromEntries(this.activeTimers)
    });

    const settings = await this.getSettings();
    
    // 既存の通知システム
    if (settings.notifications) {
      this.showNotification('タスク開始', `「${timerData.taskTitle}」の時間計測を開始しました`);
    }

    // バナー通知を送信
    await this.sendBannerNotification({
      type: 'start',
      taskTitle: timerData.taskTitle,
      projectName: timerData.projectName,
      service: timerData.service
    }, timerData.tabId);
  }

  async stopTimer(timerKey) {
    const timer = this.activeTimers.get(timerKey);
    if (!timer) return;

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

    // 既存の通知システム
    if (settings.notifications) {
      const durationText = this.formatDuration(duration);
      this.showNotification('タスク完了', `「${timer.taskTitle}」の作業時間: ${durationText}`);
    }

    // バナー通知を送信
    await this.sendBannerNotification({
      type: 'stop',
      taskTitle: timer.taskTitle,
      duration: duration,
      projectName: timer.projectName,
      service: timer.service
    }, timer.tabId);
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
    console.log('[Background] Restoring active timers from storage');
    try {
      const { activeTimers = {} } = await chrome.storage.local.get(['activeTimers']);
      
      Object.entries(activeTimers).forEach(([timerKey, timerData]) => {
        // タイマーが24時間以上古い場合は削除
        const hoursSinceStart = (Date.now() - timerData.startTime) / (1000 * 60 * 60);
        if (hoursSinceStart > 24) {
          console.log(`[Background] Removing stale timer for ${timerKey} (${hoursSinceStart.toFixed(1)} hours old)`);
          return;
        }
        
        this.activeTimers.set(timerKey, timerData);
        console.log(`[Background] Restored timer for ${timerKey}, running for ${this.formatDuration(Date.now() - timerData.startTime)}`);
      });
      
      this.updateBadge();
      console.log(`[Background] Restored ${this.activeTimers.size} active timers`);
    } catch (error) {
      console.error('[Background] Error restoring active timers:', error);
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
    console.log(`[Background] Periodic check: ${this.activeTimers.size} active timers`);
    
    // ストレージと同期
    await chrome.storage.local.set({
      activeTimers: Object.fromEntries(this.activeTimers)
    });
    
    // 各タイマーの状態をログ出力
    this.activeTimers.forEach((timer, timerKey) => {
      const duration = Date.now() - timer.startTime;
      console.log(`[Background] Timer ${timerKey}: ${this.formatDuration(duration)} (${timer.taskTitle})`);
    });
    
    this.updateBadge();
  }

  checkActivity() {
    // 非アクティブ時間の検出（設定で有効な場合）
    const inactiveThreshold = 30 * 60 * 1000; // 30分
    const now = Date.now();
    
    if (now - this.lastActivity > inactiveThreshold) {
      console.log('[Background] Long inactivity detected, pausing timers temporarily');
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

  updateBadge() {
    const activeCount = this.activeTimers.size;
    chrome.action.setBadgeText({
      text: activeCount > 0 ? activeCount.toString() : ''
    });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  }

  showNotification(title, message) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: '/src/icons/icon48.svg',
      title,
      message
    });
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
    console.log(`[Background] Clearing all ${this.activeTimers.size} active timers`);
    
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
      console.log(`[Background] Cleared timer: ${timer.taskTitle} (${this.formatDuration(duration)})`);
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
    
    if ((await this.getSettings()).notifications) {
      this.showNotification('タイマークリア', `${clearedTimers.length}個のタイマーをクリアしました`);
    }
  }
  
  async getActiveTimers(sendResponse) {
    console.log('[Background] Getting active timers for content script');
    
    const activeTimersObj = Object.fromEntries(this.activeTimers);
    console.log(`[Background] Returning ${Object.keys(activeTimersObj).length} active timers`);
    
    sendResponse({
      success: true,
      activeTimers: activeTimersObj
    });
  }
  
  async getSettingsForContentScript(sendResponse) {
    console.log('[Background] Getting settings for content script');
    
    try {
      const settings = await this.getSettings();
      console.log('[Background] Returning settings:', settings);
      
      sendResponse({
        success: true,
        settings: settings
      });
    } catch (error) {
      console.error('[Background] Error getting settings:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    }
  }

  
  setupWebRequestListeners() {
    console.log('[Background] Setting up webRequest listeners for Backlog API monitoring');
    
    // リクエストのヘッダーを取得
    chrome.webRequest.onBeforeSendHeaders.addListener(
      (details) => {
        if (this.isBacklogKanbanAPI(details.url)) {
          console.log('[Background] 📤 Backlog API request headers:', {
            url: details.url,
            method: details.method,
            headers: details.requestHeaders
          });
          
          // ヘッダー情報を一時保存
          this.storeRequestInfo(details);
        }
      },
      {
        urls: [
          "*://*.backlog.jp/board-api/kanban*",
          "*://*.backlog.com/board-api/kanban*",
          "*://*.backlog.jp/api/*kanban*",
          "*://*.backlog.com/api/*kanban*"
        ]
      },
      ['requestHeaders']
    );
    
    // リクエスト完了時の監視
    chrome.webRequest.onCompleted.addListener(
      (details) => {
        console.log('[Background] 🌐 Web request completed:', details.url);
        
        // Backlog Kanban APIかチェック
        if (this.isBacklogKanbanAPI(details.url)) {
          console.log('[Background] 🎯 Backlog Kanban API detected:', details.url);
          this.handleBacklogKanbanRequest(details);
        }
      },
      {
        urls: [
          "*://*.backlog.jp/board-api/kanban*",
          "*://*.backlog.com/board-api/kanban*",
          "*://*.backlog.jp/api/*kanban*",
          "*://*.backlog.com/api/*kanban*"
        ]
      }
    );
    
    // レスポンスボディを取得するためのリスナー
    chrome.webRequest.onResponseStarted.addListener(
      (details) => {
        if (this.isBacklogKanbanAPI(details.url)) {
          console.log('[Background] 📥 Backlog API response started:', {
            url: details.url,
            status: details.statusCode,
            method: details.method
          });
        }
      },
      {
        urls: [
          "*://*.backlog.jp/board-api/kanban*",
          "*://*.backlog.com/board-api/kanban*",
          "*://*.backlog.jp/api/*kanban*",
          "*://*.backlog.com/api/*kanban*"
        ]
      }
    );
    
    // リクエスト情報の一時保存用
    this.requestInfoCache = new Map();
  }
  
  isBacklogKanbanAPI(url) {
    if (!url) return false;
    
    const patterns = [
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/board-api\/kanban/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/api\/.*kanban/
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }
  
  storeRequestInfo(details) {
    const requestKey = `${details.method}:${details.url}:${details.timeStamp}`;
    const requestInfo = {
      url: details.url,
      method: details.method,
      headers: details.requestHeaders,
      timestamp: details.timeStamp
    };
    
    this.requestInfoCache.set(requestKey, requestInfo);
    console.log('[Background] 💾 Stored request info:', requestKey);
    
    // 古いエントリを削除（5分以上古いもの）
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key, info] of this.requestInfoCache.entries()) {
      if (info.timestamp < fiveMinutesAgo) {
        this.requestInfoCache.delete(key);
      }
    }
  }
  
  getRequestInfo(details) {
    // 同じURLとメソッドで最も近い時間のリクエスト情報を探す
    let bestMatch = null;
    let minTimeDiff = Infinity;
    
    for (const [key, info] of this.requestInfoCache.entries()) {
      if (info.url === details.url && info.method === details.method) {
        const timeDiff = Math.abs(details.timeStamp - info.timestamp);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          bestMatch = info;
        }
      }
    }
    
    return bestMatch;
  }

  async handleBacklogKanbanRequest(details) {
    console.log('[Background] 🔄 Processing Backlog Kanban request:', details);
    
    // 保存されたリクエスト情報を取得
    const requestInfo = this.getRequestInfo(details);
    
    // content scriptに通知を送信（ヘッダー情報も含む）
    try {
      // アクティブなBacklogタブを探す
      const tabs = await chrome.tabs.query({
        url: ["*://*.backlog.jp/*", "*://*.backlog.com/*"]
      });
      
      for (const tab of tabs) {
        console.log(`[Background] 📤 Notifying tab ${tab.id} of Kanban API request`);
        
        chrome.tabs.sendMessage(tab.id, {
          type: 'BACKLOG_API_REQUEST',
          data: {
            url: details.url,
            method: details.method,
            headers: requestInfo?.headers || [],
            timestamp: Date.now(),
            originalTimestamp: details.timeStamp
          }
        }).catch(error => {
          console.log(`[Background] Tab ${tab.id} not ready for messages:`, error.message);
        });
      }
    } catch (error) {
      console.error('[Background] Error handling Kanban request:', error);
    }
  }

  async sendBannerNotification(data, preferredTabId = null) {
    console.log('[Background] Sending banner notification:', data);
    
    try {
      // 優先的に指定されたタブに送信
      if (preferredTabId) {
        try {
          await chrome.tabs.sendMessage(preferredTabId, {
            type: 'SHOW_BANNER_NOTIFICATION',
            data: data
          });
          console.log(`[Background] Banner notification sent to preferred tab ${preferredTabId}`);
          return;
        } catch (error) {
          console.log(`[Background] Preferred tab ${preferredTabId} not available:`, error.message);
        }
      }

      // サービスに応じて適切なタブを探す
      let urlPatterns = [];
      if (data.service === 'backlog') {
        urlPatterns = ["*://*.backlog.jp/*", "*://*.backlog.com/*"];
      } else if (data.service === 'github') {
        urlPatterns = ["*://github.com/*"];
      } else {
        // すべてのタブを対象にする
        urlPatterns = ["*://*.backlog.jp/*", "*://*.backlog.com/*", "*://github.com/*"];
      }

      const tabs = await chrome.tabs.query({
        url: urlPatterns
      });

      let sent = false;
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHOW_BANNER_NOTIFICATION',
            data: data
          });
          console.log(`[Background] Banner notification sent to tab ${tab.id} (${tab.url})`);
          sent = true;
          break; // 最初に成功したタブのみに送信
        } catch (error) {
          console.log(`[Background] Tab ${tab.id} not ready for banner notification:`, error.message);
        }
      }

      if (!sent) {
        console.log('[Background] No suitable tabs found for banner notification');
      }
    } catch (error) {
      console.error('[Background] Error sending banner notification:', error);
    }
  }
}

// Service Worker startup/install events
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension startup detected');
  new TaskTimeTracker();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed/updated');
  new TaskTimeTracker();
});

// Always initialize on script load
console.log('[Background] Background script loaded');
new TaskTimeTracker();