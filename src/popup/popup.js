class PopupController {
  constructor() {
    this.timers = [];
    this.settings = null;
    this.init();
  }

  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.render();
    this.startTimerUpdates();
  }

  async loadData() {
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'GET_TIME_SUMMARY' }, resolve);
    });

    this.timers = response.activeTimers || [];
    this.todayTime = response.today || 0;
    this.weekTime = response.thisWeek || 0;
    this.todayByTask = response.todayByTask || [];
    this.thisWeekByTask = response.thisWeekByTask || [];

    const stored = await chrome.storage.local.get(['settings']);
    this.settings = stored.settings;
  }

  setupEventListeners() {
    document.getElementById('settingsBtn').addEventListener('click', () => {
      this.showSettingsModal();
    });

    document.getElementById('reportBtn').addEventListener('click', () => {
      this.showReportModal();
    });

    document.getElementById('closeSettings').addEventListener('click', () => {
      this.hideSettingsModal();
    });

    document.getElementById('closeReport').addEventListener('click', () => {
      this.hideReportModal();
    });

    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('clearAllTimers').addEventListener('click', () => {
      this.clearAllTimers();
    });

    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
      }
    });
  }

  render() {
    this.renderActiveTimers();
    this.renderTimeSummary();
    this.renderTodayTasks();
  }

  renderActiveTimers() {
    const container = document.getElementById('activeTimers');
    const clearAllBtn = document.getElementById('clearAllTimers');
    
    if (this.timers.length === 0) {
      container.innerHTML = '<div class="no-timers">実行中のタスクはありません</div>';
      clearAllBtn.style.display = 'none';
      return;
    }

    // タイマーがある場合は全削除ボタンを表示
    clearAllBtn.style.display = 'block';

    container.innerHTML = this.timers.map(timer => `
      <div class="timer-item">
        <div class="task-info">
          <div class="task-title">${this.escapeHtml(timer.taskTitle)}</div>
          <div class="task-project">
            ${timer.service === 'backlog' && timer.spaceId ? `[${timer.spaceId}] ` : ''}${timer.taskId}
          </div>
          ${timer.projectName ? `<div class="project-name">${this.escapeHtml(timer.projectName)}</div>` : ''}
        </div>
        <div class="timer-controls">
          <div class="timer-duration">${this.formatDuration(timer.duration)}</div>
          <button class="btn-stop-timer" 
                  data-task-id="${this.escapeHtml(timer.taskId)}"
                  data-timer-key="${this.escapeHtml(timer.timerKey)}"
                  data-service="${this.escapeHtml(timer.service)}"
                  data-issue-key="${timer.issueKey || ''}"
                  data-space-id="${timer.spaceId || ''}"
                  title="このタイマーを停止">
            ×
          </button>
        </div>
      </div>
    `).join('');

    // 個別の停止ボタンにイベントリスナーを追加
    container.querySelectorAll('.btn-stop-timer').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = btn.getAttribute('data-task-id');
        const timerKey = btn.getAttribute('data-timer-key');
        const service = btn.getAttribute('data-service');
        const issueKey = btn.getAttribute('data-issue-key');
        const spaceId = btn.getAttribute('data-space-id');
        this.stopTimer(taskId, service, issueKey, spaceId);
      });
    });
  }

  renderTimeSummary() {
    document.getElementById('todayTime').textContent = this.formatDuration(this.todayTime);
    document.getElementById('weekTime').textContent = this.formatDuration(this.weekTime);
  }

  renderTodayTasks() {
    const container = document.getElementById('todayTasks');
    
    if (!this.todayByTask || this.todayByTask.length === 0) {
      container.innerHTML = '<div class="no-tasks">まだタスクがありません</div>';
      return;
    }

    container.innerHTML = this.todayByTask.map(task => `
      <div class="task-item">
        <div class="task-info">
          <div class="task-title">${this.escapeHtml(task.taskTitle)}</div>
          <div class="task-details">
            <span class="task-service">${task.service}</span>
            ${task.service === 'backlog' && task.spaceId ? `<span class="task-space">[${task.spaceId}]</span>` : ''}
            ${task.projectName ? `<span class="task-project">${this.escapeHtml(task.projectName)}</span>` : ''}
            <span class="task-sessions">${task.sessions.length}セッション</span>
          </div>
        </div>
        <div class="task-duration">${this.formatDuration(task.totalDuration)}</div>
      </div>
    `).join('');
  }

  showSettingsModal() {
    const modal = document.getElementById('settingsModal');
    
    if (this.settings) {
      const backlogStart = this.settings.trackingStatuses.backlog.start.join(',');
      const githubStart = this.settings.trackingStatuses.github.start.join(',');

      document.getElementById('backlogStart').value = backlogStart;
      document.getElementById('githubStart').value = githubStart;
      document.getElementById('notifications').checked = this.settings.notifications;
    }

    modal.classList.add('show');
  }

  hideSettingsModal() {
    document.getElementById('settingsModal').classList.remove('show');
  }

  async saveSettings() {
    const backlogStart = document.getElementById('backlogStart').value.split(',').map(s => s.trim()).filter(s => s);
    const githubStart = document.getElementById('githubStart').value.split(',').map(s => s.trim()).filter(s => s);
    const notifications = document.getElementById('notifications').checked;

    const newSettings = {
      ...this.settings,
      trackingStatuses: {
        backlog: {
          start: backlogStart
        },
        github: {
          start: githubStart
        }
      },
      notifications
    };

    await chrome.storage.local.set({ settings: newSettings });
    chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: newSettings
    });

    this.settings = newSettings;
    this.hideSettingsModal();
  }

  async showReportModal() {
    const modal = document.getElementById('reportModal');
    const content = document.getElementById('reportContent');
    
    modal.classList.add('show');
    content.innerHTML = '<div class="loading">レポートを読み込み中...</div>';

    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_TIME_SUMMARY' }, resolve);
      });
      
      const reportHtml = this.generateReport(response);
      content.innerHTML = reportHtml;
    } catch (error) {
      content.innerHTML = '<div class="error">レポートの読み込みに失敗しました</div>';
    }
  }

  hideReportModal() {
    document.getElementById('reportModal').classList.remove('show');
  }

  generateReport(summaryData) {
    if (!summaryData.todayByTask && !summaryData.thisWeekByTask) {
      return '<div class="no-data">まだデータがありません</div>';
    }

    const todayTasks = summaryData.todayByTask || [];
    const weekTasks = summaryData.thisWeekByTask || [];

    return `
      <div class="report-section">
        <h4>日別サマリー</h4>
        <div class="report-item">
          <span>今日: ${this.formatDuration(summaryData.today || 0)}</span>
          <span class="task-count">(${todayTasks.length}タスク)</span>
        </div>
        <div class="report-item">
          <span>今週合計: ${this.formatDuration(summaryData.thisWeek || 0)}</span>
          <span class="task-count">(${weekTasks.length}タスク)</span>
        </div>
      </div>

      <div class="report-section">
        <h4>今日のタスク別時間</h4>
        ${todayTasks.length > 0 ? todayTasks.map(task => `
          <div class="task-summary">
            <div class="task-header">
              <div class="task-title">${this.escapeHtml(task.taskTitle)}</div>
              <div class="task-time">${this.formatDuration(task.totalDuration)}</div>
            </div>
            <div class="task-details">
              <span class="task-service">${task.service}</span>
              ${task.service === 'backlog' && task.spaceId ? `<span class="task-space">[${task.spaceId}]</span>` : ''}
              ${task.projectName ? `<span class="task-project">${this.escapeHtml(task.projectName)}</span>` : ''}
              <span class="task-sessions">${task.sessions.length}セッション</span>
            </div>
          </div>
        `).join('') : '<div class="no-data">今日はまだタスクがありません</div>'}
      </div>

      <div class="report-section">
        <h4>今週のタスク別時間</h4>
        ${weekTasks.length > 0 ? weekTasks.map(task => `
          <div class="task-summary">
            <div class="task-header">
              <div class="task-title">${this.escapeHtml(task.taskTitle)}</div>
              <div class="task-time">${this.formatDuration(task.totalDuration)}</div>
            </div>
            <div class="task-details">
              <span class="task-service">${task.service}</span>
              ${task.service === 'backlog' && task.spaceId ? `<span class="task-space">[${task.spaceId}]</span>` : ''}
              ${task.projectName ? `<span class="task-project">${this.escapeHtml(task.projectName)}</span>` : ''}
              <span class="task-sessions">${task.sessions.length}セッション</span>
            </div>
          </div>
        `).join('') : '<div class="no-data">今週はまだタスクがありません</div>'}
      </div>
    `;
  }

  groupLogsByTask(logs) {
    const taskMap = new Map();

    logs.forEach(log => {
      if (taskMap.has(log.taskId)) {
        taskMap.get(log.taskId).totalTime += log.duration;
      } else {
        taskMap.set(log.taskId, {
          title: log.taskTitle,
          totalTime: log.duration
        });
      }
    });

    return Array.from(taskMap.values()).sort((a, b) => b.totalTime - a.totalTime);
  }

  calculateTotalTime(logs) {
    return logs.reduce((total, log) => total + log.duration, 0);
  }

  startTimerUpdates() {
    setInterval(async () => {
      await this.loadData();
      this.render();
    }, 1000);
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

  async stopTimer(taskId, service, issueKey, spaceId) {
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ 
          type: 'STOP_TIMER', 
          taskId: taskId,
          service: service,
          issueKey: issueKey,
          spaceId: spaceId
        }, resolve);
      });

      if (response && response.success) {
        console.log('Timer stopped successfully');
        // データを再読み込みして表示を更新
        await this.loadData();
        this.render();
      } else {
        console.error('Failed to stop timer:', response);
      }
    } catch (error) {
      console.error('Error stopping timer:', error);
    }
  }

  async clearAllTimers() {
    if (!confirm('全ての実行中タイマーを停止してもよろしいですか？\n（作業時間はログに記録されます）')) {
      return;
    }

    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ 
          type: 'CLEAR_ALL_TIMERS' 
        }, resolve);
      });

      if (response && response.success) {
        console.log('All timers cleared successfully');
        // データを再読み込みして表示を更新
        await this.loadData();
        this.render();
      } else {
        console.error('Failed to clear all timers:', response);
      }
    } catch (error) {
      console.error('Error clearing all timers:', error);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});