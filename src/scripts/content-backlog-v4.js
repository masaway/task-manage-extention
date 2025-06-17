class BacklogTaskTrackerV4 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    
    // APIレスポンスのみに特化
    this.setupNetworkInterception();
    
    console.log('[Backlog Tracker V4] 🚀 API-only tracking initialized');
  }

  setupNetworkInterception() {
    console.log('[Backlog Tracker V4] 🔧 Setting up network interception');
    
    // 元のメソッドを保存
    this.originalFetch = window.fetch;
    this.originalXMLHttpRequest = window.XMLHttpRequest;
    
    this.interceptFetch();
    this.interceptXHR();
    
    // デバッグ用：全てのネットワーク活動をログ
    this.logAllNetworkActivity();
  }

  interceptFetch() {
    const tracker = this;
    
    window.fetch = async function(...args) {
      const url = args[0];
      const options = args[1] || {};
      
      console.log('[Backlog Tracker V4] 🌐 Fetch:', {
        url: url,
        method: options.method || 'GET',
        isBacklogAPI: tracker.isBacklogKanbanAPI(url)
      });
      
      try {
        const response = await tracker.originalFetch.apply(this, args);
        
        // Backlog Kanban APIの場合のみ処理
        if (tracker.isBacklogKanbanAPI(url)) {
          console.log('[Backlog Tracker V4] 🎯 Backlog Kanban API detected:', url);
          await tracker.processBacklogResponse(response.clone(), url);
        }
        
        return response;
      } catch (error) {
        console.error('[Backlog Tracker V4] Fetch error:', error);
        throw error;
      }
    };
  }

  interceptXHR() {
    const tracker = this;
    
    class InterceptedXMLHttpRequest extends this.originalXMLHttpRequest {
      open(method, url, ...args) {
        this._intercepted = { method, url };
        console.log('[Backlog Tracker V4] 📡 XHR Open:', {
          method: method,
          url: url,
          isBacklogAPI: tracker.isBacklogKanbanAPI(url)
        });
        
        return super.open(method, url, ...args);
      }
      
      send(data) {
        if (this._intercepted && tracker.isBacklogKanbanAPI(this._intercepted.url)) {
          console.log('[Backlog Tracker V4] 🎯 Backlog XHR Send:', this._intercepted.url);
          
          this.addEventListener('load', () => {
            if (this.responseText) {
              console.log('[Backlog Tracker V4] 📥 XHR Response received');
              tracker.processBacklogResponseText(this.responseText, this._intercepted.url);
            }
          });
        }
        
        return super.send(data);
      }
    }
    
    window.XMLHttpRequest = InterceptedXMLHttpRequest;
  }

  isBacklogKanbanAPI(url) {
    if (!url) return false;
    
    // Backlog Kanban APIのパターンを厳密にチェック
    const patterns = [
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/board-api\/kanban/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/api\/.*kanban/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/.*board.*api/
    ];
    
    const isMatch = patterns.some(pattern => pattern.test(url));
    
    if (isMatch) {
      console.log('[Backlog Tracker V4] ✅ Kanban API pattern matched:', url);
    }
    
    return isMatch;
  }

  async processBacklogResponse(response, url) {
    try {
      const text = await response.text();
      console.log('[Backlog Tracker V4] 📄 Raw response text length:', text.length);
      
      this.processBacklogResponseText(text, url);
      
    } catch (error) {
      console.error('[Backlog Tracker V4] Error processing response:', error);
    }
  }

  processBacklogResponseText(text, url) {
    try {
      if (!text || text.length === 0) {
        console.log('[Backlog Tracker V4] ⚠️ Empty response');
        return;
      }
      
      console.log('[Backlog Tracker V4] 📝 Response preview:', text.substring(0, 200));
      
      const data = JSON.parse(text);
      console.log('[Backlog Tracker V4] 📊 Parsed JSON data:', data);
      
      this.analyzeBacklogData(data, url);
      
    } catch (error) {
      console.log('[Backlog Tracker V4] ⚠️ Response is not JSON:', text.substring(0, 100));
    }
  }

  analyzeBacklogData(data, url) {
    console.log('[Backlog Tracker V4] 🔍 Analyzing Backlog data structure:', {
      type: typeof data,
      isArray: Array.isArray(data),
      keys: typeof data === 'object' ? Object.keys(data) : null
    });
    
    // updateCard パターンを検索
    if (this.findUpdateCard(data)) {
      return; // updateCard が見つかった場合は処理済み
    }
    
    // その他のパターンも検索
    this.findOtherTaskPatterns(data);
  }

  findUpdateCard(data, path = '') {
    console.log(`[Backlog Tracker V4] 🔍 Searching for updateCard in:`, path || 'root');
    
    // 直接 updateCard がある場合
    if (data && data.updateCard) {
      console.log('[Backlog Tracker V4] ✅ Found updateCard!', data.updateCard);
      this.handleUpdateCard(data.updateCard);
      return true;
    }
    
    // ネストされたオブジェクトを検索
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (key === 'updateCard' && value) {
          console.log(`[Backlog Tracker V4] ✅ Found updateCard at ${path}.${key}!`, value);
          this.handleUpdateCard(value);
          return true;
        }
        
        // 再帰的に検索
        if (typeof value === 'object' && value !== null) {
          if (this.findUpdateCard(value, `${path}.${key}`)) {
            return true;
          }
        }
      }
    }
    
    // 配列の場合
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (this.findUpdateCard(data[i], `${path}[${i}]`)) {
          return true;
        }
      }
    }
    
    return false;
  }

  findOtherTaskPatterns(data) {
    console.log('[Backlog Tracker V4] 🔍 Searching for other task patterns...');
    
    // よくあるパターンを検索
    const patterns = [
      'card', 'task', 'issue', 'item', 'status', 'move', 'update', 'change'
    ];
    
    const foundPatterns = [];
    
    function searchObject(obj, path = '') {
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          // キー名にパターンが含まれるかチェック
          const keyLower = key.toLowerCase();
          for (const pattern of patterns) {
            if (keyLower.includes(pattern)) {
              foundPatterns.push({
                pattern: pattern,
                key: key,
                path: `${path}.${key}`,
                value: value
              });
            }
          }
          
          // 再帰的に検索
          if (typeof value === 'object') {
            searchObject(value, `${path}.${key}`);
          }
        }
      }
    }
    
    searchObject(data);
    
    if (foundPatterns.length > 0) {
      console.log('[Backlog Tracker V4] 🎯 Found potential task patterns:', foundPatterns);
      
      // 最も関連性の高そうなパターンを処理
      foundPatterns.forEach(pattern => {
        if (pattern.pattern === 'issue' && pattern.value && typeof pattern.value === 'object') {
          console.log('[Backlog Tracker V4] 🔄 Processing issue pattern:', pattern);
          this.handleIssuePattern(pattern.value, pattern.path);
        }
      });
    } else {
      console.log('[Backlog Tracker V4] ❌ No recognizable task patterns found');
    }
  }

  async handleUpdateCard(updateCard) {
    console.log('[Backlog Tracker V4] 🎯 Processing updateCard (from DevTools):', updateCard);
    
    if (!updateCard.issue) {
      console.log('[Backlog Tracker V4] ⚠️ updateCard has no issue data');
      return;
    }
    
    const issue = updateCard.issue;
    console.log('[Backlog Tracker V4] 📋 Issue data:', {
      issueKey: issue.issueKey,
      summary: issue.summary,
      status: issue.status,
      id: issue.id
    });
    
    const taskInfo = {
      id: this.generateTaskId(issue.issueKey, issue.id),
      title: issue.summary,
      status: issue.status ? issue.status.name : 'Unknown',
      issueKey: issue.issueKey,
      issueId: issue.id,
      projectId: issue.projectId,
      projectName: this.getProjectName(),
      spaceId: this.getSpaceId()
    };
    
    console.log('[Backlog Tracker V4] ✅ Extracted task info from updateCard:', taskInfo);
    
    // 現在計測中のタスクと照合
    await this.checkAndProcessTaskChange(taskInfo);
  }
  
  async checkAndProcessTaskChange(taskInfo) {
    console.log('[Backlog Tracker V4] 🔍 Checking against active timers...');
    
    try {
      // Background Scriptから現在のアクティブタイマーを取得
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TIMERS' }, resolve);
      });
      
      if (response && response.activeTimers) {
        console.log('[Backlog Tracker V4] 📊 Active timers received:', response.activeTimers);
        
        // アクティブタイマーの中から一致するタスクを検索
        const matchingTimer = this.findMatchingTimer(taskInfo, response.activeTimers);
        
        if (matchingTimer) {
          console.log('[Backlog Tracker V4] ✅ Found matching active timer:', matchingTimer);
          await this.processMatchingTaskChange(taskInfo, matchingTimer);
        } else {
          console.log('[Backlog Tracker V4] 📝 No matching active timer found, treating as new status change');
          this.sendStatusChange(taskInfo);
        }
      } else {
        console.log('[Backlog Tracker V4] ⚠️ No active timers or failed to get response');
        this.sendStatusChange(taskInfo);
      }
    } catch (error) {
      console.error('[Backlog Tracker V4] ❌ Error checking active timers:', error);
      // エラーの場合は通常の処理にフォールバック
      this.sendStatusChange(taskInfo);
    }
  }
  
  findMatchingTimer(taskInfo, activeTimers) {
    console.log('[Backlog Tracker V4] 🔍 Searching for matching timer...');
    console.log('[Backlog Tracker V4] 📋 Task to match:', {
      title: taskInfo.title,
      issueKey: taskInfo.issueKey,
      spaceId: taskInfo.spaceId
    });
    
    for (const [timerId, timerData] of Object.entries(activeTimers)) {
      console.log(`[Backlog Tracker V4] 🔍 Checking timer ${timerId}:`, {
        taskTitle: timerData.taskTitle,
        issueKey: timerData.issueKey,
        spaceId: timerData.spaceId,
        service: timerData.service
      });
      
      // Backlogサービスのタイマーのみチェック
      if (timerData.service !== 'backlog') {
        continue;
      }
      
      // 3つの条件で照合
      const titleMatch = timerData.taskTitle === taskInfo.title;
      const issueKeyMatch = timerData.issueKey === taskInfo.issueKey;
      const spaceMatch = timerData.spaceId === taskInfo.spaceId;
      
      console.log(`[Backlog Tracker V4] 🎯 Match analysis for ${timerId}:`, {
        titleMatch: titleMatch,
        issueKeyMatch: issueKeyMatch,
        spaceMatch: spaceMatch
      });
      
      // Issue Keyが一致すれば確実に同じタスク
      if (issueKeyMatch && spaceMatch) {
        console.log('[Backlog Tracker V4] ✅ Exact match found by issueKey and spaceId');
        return { timerId, timerData };
      }
      
      // Issue Keyがない場合はタイトルとスペースIDで照合
      if (!taskInfo.issueKey && !timerData.issueKey && titleMatch && spaceMatch) {
        console.log('[Backlog Tracker V4] ✅ Match found by title and spaceId');
        return { timerId, timerData };
      }
    }
    
    console.log('[Backlog Tracker V4] ❌ No matching timer found');
    return null;
  }
  
  async processMatchingTaskChange(taskInfo, matchingTimer) {
    console.log('[Backlog Tracker V4] 🔄 Processing matched task change...');
    
    const { timerId, timerData } = matchingTimer;
    const newStatus = taskInfo.status;
    
    console.log('[Backlog Tracker V4] 📊 Task change details:', {
      timerId: timerId,
      currentTask: timerData.taskTitle,
      newStatus: newStatus,
      oldStatus: 'Unknown (was being tracked)'
    });
    
    // 設定を取得して計測継続すべきかチェック
    const shouldContinueTracking = await this.shouldContinueTracking(newStatus);
    
    if (shouldContinueTracking) {
      console.log('[Backlog Tracker V4] ▶️ Status change within tracking statuses, continuing timer');
      // ステータス更新のみ（タイマー継続）
      this.sendStatusUpdate(taskInfo, timerData);
    } else {
      console.log('[Backlog Tracker V4] ⏹️ Status change to non-tracking status, stopping timer');
      // タイマー停止
      this.sendTimerStop(taskInfo, timerData);
    }
  }
  
  async shouldContinueTracking(status) {
    try {
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
      });
      
      if (response && response.settings) {
        const backlogSettings = response.settings.trackingStatuses?.backlog;
        if (backlogSettings && backlogSettings.start) {
          const shouldTrack = backlogSettings.start.includes(status);
          console.log('[Backlog Tracker V4] 🎯 Tracking check:', {
            status: status,
            trackingStatuses: backlogSettings.start,
            shouldTrack: shouldTrack
          });
          return shouldTrack;
        }
      }
    } catch (error) {
      console.error('[Backlog Tracker V4] Error getting settings:', error);
    }
    
    // フォールバック: 一般的な作業中ステータス
    return ['処理中', 'now', 'In Progress', '作業中'].includes(status);
  }
  
  sendStatusUpdate(taskInfo, timerData) {
    console.log('[Backlog Tracker V4] 📤 Sending status update (timer continues):', taskInfo);
    
    // ここでは実際にはタイマーを停止せず、状態更新のみ
    // Background Scriptに適切な情報を送信
    this.sendStatusChange(taskInfo, 'UPDATE');
  }
  
  sendTimerStop(taskInfo, timerData) {
    console.log('[Backlog Tracker V4] 📤 Sending timer stop request:', taskInfo);
    
    // 明示的にタイマー停止を指示
    this.sendStatusChange(taskInfo, 'STOP');
  }

  handleIssuePattern(issueData, path) {
    console.log(`[Backlog Tracker V4] 🔄 Processing issue pattern at ${path}:`, issueData);
    
    if (issueData.status && issueData.summary) {
      const taskInfo = {
        id: this.generateTaskId(issueData.issueKey, issueData.id),
        title: issueData.summary,
        status: typeof issueData.status === 'object' ? issueData.status.name : issueData.status,
        issueKey: issueData.issueKey,
        issueId: issueData.id,
        projectName: this.getProjectName()
      };
      
      console.log('[Backlog Tracker V4] ✅ Extracted task info from issue pattern:', taskInfo);
      this.sendStatusChange(taskInfo);
    }
  }

  generateTaskId(issueKey, issueId) {
    if (issueKey) {
      return `backlog-${issueKey}`;
    }
    if (issueId) {
      return `backlog-issue-${issueId}`;
    }
    return `backlog-task-${Date.now()}`;
  }

  getProjectName() {
    const urlMatch = window.location.href.match(/\/([^\/]+)$/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
  }
  
  getSpaceId() {
    // URLからBacklogスペースIDを抽出
    // 例: https://way-space.backlog.com/board/TEST → "way-space"
    const urlMatch = window.location.href.match(/https?:\/\/([^.]+)\.backlog\.(com|jp)/);
    const spaceId = urlMatch ? urlMatch[1] : 'unknown-space';
    
    console.log('[Backlog Tracker V4] 🆔 Extracted space ID:', spaceId);
    return spaceId;
  }

  sendStatusChange(taskInfo) {
    const changeData = {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: this.currentStatus,
      service: 'backlog',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName,
      issueKey: taskInfo.issueKey
    };
    
    // タイマーアクションを判定
    const timerAction = this.determineTimerAction(this.currentStatus, taskInfo.status);
    console.log('[Backlog Tracker V4] 🎯 Timer action determined:', timerAction);
    
    console.log('[Backlog Tracker V4] 📤 Sending status change to background:', {
      ...changeData,
      timerAction: timerAction
    });
    
    // 現在の状態を更新
    const previousStatus = this.currentStatus;
    const previousTaskId = this.currentTaskId;
    
    this.currentStatus = taskInfo.status;
    this.currentTaskId = taskInfo.id;
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        console.log('[Backlog Tracker V4] 📥 Background response:', response);
        
        if (response && response.success) {
          console.log('[Backlog Tracker V4] ✅ Status change successfully processed');
          
          // タイマーアクションをログ出力
          if (timerAction === 'START') {
            console.log('[Backlog Tracker V4] ⏱️ Timer STARTED for:', taskInfo.title);
          } else if (timerAction === 'STOP') {
            console.log('[Backlog Tracker V4] ⏹️ Timer STOPPED for:', taskInfo.title);
          } else if (timerAction === 'CONTINUE') {
            console.log('[Backlog Tracker V4] ▶️ Timer CONTINUES for:', taskInfo.title);
          }
        } else {
          console.error('[Backlog Tracker V4] ❌ Background processing failed:', response);
        }
      });
    } catch (error) {
      console.error('[Backlog Tracker V4] Send error:', error);
    }
  }
  
  determineTimerAction(oldStatus, newStatus) {
    // タイマー開始・停止の判定ロジック
    // 通常は Background Script が設定に基づいて判定するが、
    // Content Script でも予測してログ出力
    
    const trackingStatuses = ['処理中', 'now', 'In Progress', '作業中']; // 一般的な作業中ステータス
    
    const wasTracking = oldStatus && trackingStatuses.includes(oldStatus);
    const isTracking = newStatus && trackingStatuses.includes(newStatus);
    
    console.log('[Backlog Tracker V4] 🔍 Timer action analysis:', {
      oldStatus: oldStatus,
      newStatus: newStatus,
      wasTracking: wasTracking,
      isTracking: isTracking
    });
    
    if (!wasTracking && isTracking) {
      return 'START'; // タイマー開始
    } else if (wasTracking && !isTracking) {
      return 'STOP'; // タイマー停止
    } else if (wasTracking && isTracking) {
      return 'CONTINUE'; // タイマー継続
    } else {
      return 'NONE'; // タイマー操作なし
    }
  }

  logAllNetworkActivity() {
    console.log('[Backlog Tracker V4] 🔍 Starting comprehensive network monitoring...');
    
    // すべてのfetchを監視
    const originalFetch = this.originalFetch;
    const tracker = this;
    
    window.fetch = async function(...args) {
      const url = args[0];
      console.log('[Backlog Tracker V4] 🌐 ALL FETCH:', url);
      
      if (url && typeof url === 'string' && url.includes('.backlog.')) {
        console.log('[Backlog Tracker V4] 🎯 BACKLOG FETCH DETECTED:', url);
      }
      
      const response = await originalFetch.apply(this, args);
      
      if (url && typeof url === 'string' && url.includes('.backlog.')) {
        console.log('[Backlog Tracker V4] 📥 BACKLOG RESPONSE:', {
          url: url,
          status: response.status,
          contentType: response.headers.get('content-type')
        });
        
        // レスポンスを処理
        try {
          const clone = response.clone();
          const text = await clone.text();
          if (text) {
            console.log('[Backlog Tracker V4] 📄 Response body length:', text.length);
            if (text.includes('updateCard')) {
              console.log('[Backlog Tracker V4] 🎯 FOUND updateCard in response!');
            }
            tracker.processBacklogResponseText(text, url);
          }
        } catch (e) {
          console.error('[Backlog Tracker V4] Error processing response:', e);
        }
      }
      
      return response;
    };
  }

  // デバッグ用: 手動でAPIレスポンスをテスト
  testWithSampleData() {
    console.log('[Backlog Tracker V4] 🧪 Testing with sample updateCard data...');
    
    const sampleData = {
      "updateCard": {
        "id": 101933207,
        "issue": {
          "issueKey": "TEST-4",
          "assignee": null,
          "milestones": [],
          "versions": [],
          "issueType": {
            "color": "#7ea800",
            "id": 3460064,
            "descriptionTemplate": null,
            "summaryTemplate": null,
            "name": "タスク"
          },
          "projectId": 652873,
          "id": 110438439,
          "status": {
            "id": 2,
            "name": "処理中",
            "color": "#4488c5",
            "isCustomStatus": false
          },
          "summary": "削除画面",
          "created": "2025/06/17 01:51:06",
          "categories": [],
          "dueDate": null
        },
        "order": "5000000000000000000000000000000000000000000000000000000000000000"
      }
    };
    
    this.analyzeBacklogData(sampleData, 'test://sample');
  }
}

// 初期化
console.log('[Backlog Tracker V4] 🔥 SCRIPT LOADED - URL:', window.location.href);

if (window.location.href.includes('.backlog.')) {
  console.log('[Backlog Tracker V4] 🚀 Starting V4 API-only tracker with DevTools integration');
  
  const initTracker = () => {
    console.log('[Backlog Tracker V4] 🚀 Initializing tracker...');
    window.backlogTrackerV4 = new BacklogTaskTrackerV4();
    console.log('[Backlog Tracker V4] ✅ Instance created and available globally');
    
    // DevToolsから呼び出し可能であることを確認
    console.log('[Backlog Tracker V4] 🔗 DevTools integration ready');
    
    // デバッグ用: 3秒後にサンプルデータでテスト
    setTimeout(() => {
      console.log('[Backlog Tracker V4] 🧪 Running self-test...');
      window.backlogTrackerV4.testWithSampleData();
    }, 3000);
    
    // さらなるデバッグ: 10秒後に手動でupdateCardをテスト
    setTimeout(() => {
      console.log('[Backlog Tracker V4] 🔥 Manual updateCard test...');
      if (window.backlogTrackerV4) {
        const testCard = {
          "id": 101933207,
          "issue": {
            "issueKey": "TEST-4",
            "assignee": null,
            "milestones": [],
            "versions": [],
            "issueType": {"color": "#7ea800", "id": 3460064, "name": "タスク"},
            "projectId": 652873,
            "id": 110438439,
            "status": {"id": 1, "name": "未対応", "color": "#ed8077"},
            "summary": "テストタスク",
            "created": "2025/06/17 01:51:06",
            "categories": [],
            "dueDate": null
          }
        };
        window.backlogTrackerV4.handleUpdateCard(testCard);
      }
    }, 10000);
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTracker);
  } else {
    initTracker();
  }
}

// デバッグ用関数をグローバルに公開
window.testBacklogTracker = () => {
  if (window.backlogTrackerV4) {
    window.backlogTrackerV4.testWithSampleData();
  }
};