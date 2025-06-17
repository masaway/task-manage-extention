class BacklogTaskTrackerV6 {
  constructor() {
    this.currentTaskStates = new Map(); // タスクの現在状態を保存
    this.lastKnownStates = new Map();   // 前回の状態を保存
    
    // webRequest + DOM解析のシンプルな実装
    this.setupWebRequestListener();
    this.setupDOMAnalysis();
    
    console.log('[Backlog Tracker V6] 🚀 webRequest + DOM analysis implementation initialized');
  }
  
  setupWebRequestListener() {
    console.log('[Backlog Tracker V6] 🔧 Setting up webRequest message listener');
    
    // Background scriptからのメッセージを受信
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'BACKLOG_API_REQUEST') {
        console.log('[Backlog Tracker V6] 📥 Received kanban API notification:', message.data);
        this.handleKanbanAPIRequest(message.data);
        sendResponse({ success: true });
      }
    });
  }
  
  async handleKanbanAPIRequest(requestData) {
    console.log('[Backlog Tracker V6] 🔄 Processing kanban API request...');
    
    // APIリクエスト後に少し待ってからDOMを解析
    setTimeout(() => {
      this.analyzeCurrentDOMState();
    }, 200); // DOM更新を待つ
    
    setTimeout(() => {
      this.analyzeCurrentDOMState();
    }, 500); // さらに待って再度チェック
  }
  
  setupDOMAnalysis() {
    console.log('[Backlog Tracker V6] 🔧 Setting up DOM analysis');
    
    // 初期状態を記録
    const recordInitialState = () => {
      console.log('[Backlog Tracker V6] 📋 Recording initial DOM state...');
      this.analyzeCurrentDOMState(true); // 初期フラグ
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', recordInitialState);
    } else {
      recordInitialState();
    }
    
    // 定期的にDOM状態をチェック（軽量）
    setInterval(() => {
      this.analyzeCurrentDOMState();
    }, 5000);
  }
  
  analyzeCurrentDOMState(isInitial = false) {
    console.log('[Backlog Tracker V6] 🔍 Analyzing current DOM state...');
    
    try {
      const tasks = this.extractAllTasksFromDOM();
      console.log(`[Backlog Tracker V6] 📊 Found ${tasks.length} tasks in DOM`);
      
      if (isInitial) {
        // 初期状態の記録
        tasks.forEach(task => {
          this.lastKnownStates.set(task.id, task.status);
          console.log(`[Backlog Tracker V6] 📝 Initial state: ${task.id} = ${task.status}`);
        });
      } else {
        // 状態変更の検出
        this.detectTaskChanges(tasks);
      }
      
    } catch (error) {
      console.error('[Backlog Tracker V6] Error analyzing DOM:', error);
    }
  }
  
  extractAllTasksFromDOM() {
    const tasks = [];
    
    // Backlog kanbanのカード要素を検索
    const cardSelectors = [
      '[data-issue-key]',                           // data-issue-key属性
      '*[class*="card"]',                          // classにcardを含む
      '*[class*="issue"]',                         // classにissueを含む  
      '*[class*="kanban"]',                        // classにkanbanを含む
      'div[draggable="true"]',                     // ドラッグ可能な要素
      '*[data-react-beautiful-dnd-draggable]'      // react-beautiful-dnd
    ];
    
    for (const selector of cardSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`[Backlog Tracker V6] 🔍 Selector "${selector}": ${elements.length} elements`);
      
      elements.forEach(element => {
        const task = this.extractTaskInfoFromElement(element);
        if (task && task.id) {
          tasks.push(task);
        }
      });
      
      if (tasks.length > 0) {
        console.log(`[Backlog Tracker V6] ✅ Successfully extracted tasks using selector: ${selector}`);
        break; // 有効なセレクターが見つかったら他は試さない
      }
    }
    
    return tasks;
  }
  
  extractTaskInfoFromElement(element) {
    try {
      // 1. issueKeyの抽出
      let issueKey = null;
      
      // data属性から
      issueKey = element.getAttribute('data-issue-key') ||
                element.getAttribute('data-issue') ||
                element.getAttribute('data-id');
      
      // テキスト内容から（例: TEST-1, PROJ-123）
      if (!issueKey) {
        const text = element.textContent || '';
        const issueKeyMatch = text.match(/([A-Z]+)-(\d+)/);
        if (issueKeyMatch) {
          issueKey = issueKeyMatch[0];
        }
      }
      
      // 2. タイトル/要約の抽出
      let title = 'Unknown Task';
      
      // title属性から
      title = element.getAttribute('title') ||
              element.getAttribute('aria-label');
      
      // テキスト内容から
      if (!title || title === 'Unknown Task') {
        const textContent = element.textContent?.trim() || '';
        // issueKeyを除いた部分をタイトルとする
        if (issueKey && textContent.includes(issueKey)) {
          title = textContent.replace(issueKey, '').trim();
        } else {
          title = textContent.split('\n')[0]?.trim() || 'Unknown Task';
        }
      }
      
      // 3. ステータスの判定
      const status = this.determineTaskStatus(element);
      
      // 4. タスクIDの生成
      const taskId = issueKey ? `backlog-${issueKey}` : `backlog-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      const task = {
        id: taskId,
        issueKey: issueKey,
        title: title.substring(0, 100), // 長すぎる場合は切り詰め
        status: status,
        element: element,
        spaceId: this.getSpaceId()
      };
      
      // 有効なタスクかチェック
      if (task.title && task.title !== 'Unknown Task' && task.status) {
        console.log('[Backlog Tracker V6] ✅ Extracted task:', {
          id: task.id,
          issueKey: task.issueKey,
          title: task.title,
          status: task.status
        });
        return task;
      }
      
      return null;
    } catch (error) {
      console.error('[Backlog Tracker V6] Error extracting task info:', error);
      return null;
    }
  }
  
  determineTaskStatus(element) {
    // 要素の親を辿ってステータス列を特定
    let current = element;
    
    for (let i = 0; i < 10; i++) { // 最大10階層まで
      if (!current) break;
      
      // 1. data属性からステータスを取得
      const dataStatus = current.getAttribute('data-status') ||
                        current.getAttribute('data-column') ||
                        current.getAttribute('data-column-id');
      
      if (dataStatus) {
        console.log(`[Backlog Tracker V6] 📋 Found status from data attribute: ${dataStatus}`);
        return this.normalizeStatus(dataStatus);
      }
      
      // 2. クラス名からステータスを推測
      const className = current.className || '';
      if (typeof className === 'string') {
        if (className.includes('processing') || className.includes('progress')) {
          return '処理中';
        }
        if (className.includes('done') || className.includes('complete')) {
          return '完了';
        }
        if (className.includes('todo') || className.includes('open')) {
          return '未対応';
        }
      }
      
      // 3. 親要素のヘッダーテキストから推測
      const headers = current.querySelectorAll('h1, h2, h3, h4, h5, h6, *[class*="header"], *[class*="title"]');
      for (const header of headers) {
        const headerText = header.textContent?.trim();
        if (headerText && this.isStatusText(headerText)) {
          console.log(`[Backlog Tracker V6] 📋 Found status from header: ${headerText}`);
          return this.normalizeStatus(headerText);
        }
      }
      
      current = current.parentElement;
    }
    
    // 4. 最後の手段：画面全体でステータス列を探す
    return this.findStatusFromPosition(element);
  }
  
  findStatusFromPosition(element) {
    // 要素の位置を基準にステータス列を推測
    const rect = element.getBoundingClientRect();
    
    // 同じ垂直位置にあるヘッダーを探す
    const headers = document.querySelectorAll('*[class*="column"], *[class*="status"], h1, h2, h3, h4');
    
    for (const header of headers) {
      const headerRect = header.getBoundingClientRect();
      
      // 水平方向で重複している && 垂直方向で上にある
      if (headerRect.left <= rect.right && 
          headerRect.right >= rect.left && 
          headerRect.top <= rect.top) {
        
        const headerText = header.textContent?.trim();
        if (headerText && this.isStatusText(headerText)) {
          console.log(`[Backlog Tracker V6] 📍 Found status from position: ${headerText}`);
          return this.normalizeStatus(headerText);
        }
      }
    }
    
    return 'Unknown';
  }
  
  isStatusText(text) {
    if (!text) return false;
    
    const statusKeywords = [
      '処理中', '進行中', 'In Progress', 'progress', 'doing',
      '完了', '終了', 'Done', 'Complete', 'Finished', 'closed',
      '未対応', '新規', 'Todo', 'Open', 'New', 'Backlog',
      'レビュー', 'Review', 'Testing', 'テスト'
    ];
    
    return statusKeywords.some(keyword => 
      text.toLowerCase().includes(keyword.toLowerCase())
    );
  }
  
  normalizeStatus(rawStatus) {
    if (!rawStatus) return 'Unknown';
    
    const status = rawStatus.toString().toLowerCase();
    
    // 数字を除去（例: "処理中1" → "処理中"）
    const cleaned = rawStatus.replace(/\d+/g, '').trim();
    
    // 標準的なステータスにマッピング
    if (status.includes('処理') || status.includes('progress') || status.includes('doing')) {
      return '処理中';
    }
    if (status.includes('完了') || status.includes('done') || status.includes('complete')) {
      return '完了';
    }
    if (status.includes('未対応') || status.includes('todo') || status.includes('open') || status.includes('new')) {
      return '未対応';
    }
    
    return cleaned || 'Unknown';
  }
  
  detectTaskChanges(currentTasks) {
    console.log('[Backlog Tracker V6] 🔍 Detecting task changes...');
    
    currentTasks.forEach(task => {
      const lastStatus = this.lastKnownStates.get(task.id);
      
      if (!lastStatus) {
        // 新しいタスク
        console.log(`[Backlog Tracker V6] 📝 New task detected: ${task.id} = ${task.status}`);
        this.lastKnownStates.set(task.id, task.status);
      } else if (lastStatus !== task.status) {
        // ステータス変更
        console.log(`[Backlog Tracker V6] ✅ Status change detected: ${task.id} ${lastStatus} → ${task.status}`);
        
        this.handleTaskStatusChange({
          taskId: task.id,
          oldStatus: lastStatus,
          newStatus: task.status,
          taskTitle: task.title,
          issueKey: task.issueKey,
          spaceId: task.spaceId
        });
        
        // 新しい状態を記録
        this.lastKnownStates.set(task.id, task.status);
      }
    });
  }
  
  async handleTaskStatusChange(changeInfo) {
    console.log('[Backlog Tracker V6] 🔄 Processing task status change:', changeInfo);
    
    const changeData = {
      taskId: changeInfo.taskId,
      newStatus: changeInfo.newStatus,
      oldStatus: changeInfo.oldStatus,
      service: 'backlog',
      taskTitle: changeInfo.taskTitle,
      projectName: this.getProjectName(),
      issueKey: changeInfo.issueKey,
      spaceId: changeInfo.spaceId
    };
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        console.log('[Backlog Tracker V6] 📥 Background response:', response);
        
        if (response && response.success) {
          console.log('[Backlog Tracker V6] ✅ Status change successfully processed');
        } else {
          console.error('[Backlog Tracker V6] ❌ Background processing failed:', response);
        }
      });
    } catch (error) {
      console.error('[Backlog Tracker V6] Send error:', error);
    }
  }
  
  getSpaceId() {
    // URLからBacklogスペースIDを抽出
    const urlMatch = window.location.href.match(/https?:\/\/([^.]+)\.backlog\.(com|jp)/);
    const spaceId = urlMatch ? urlMatch[1] : 'unknown-space';
    return spaceId;
  }
  
  getProjectName() {
    // URLからプロジェクト名を抽出
    const urlMatch = window.location.href.match(/\/board\/([^\/\?]+)/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
  }
  
  // デバッグ用: 現在のDOM状態を手動で分析
  debugCurrentState() {
    console.log('[Backlog Tracker V6] 🧪 Manual DOM analysis...');
    this.analyzeCurrentDOMState();
  }
}

// 初期化（document_startで即座に実行）
console.log('[Backlog Tracker V6] 🔥 SCRIPT LOADED AT DOCUMENT_START - URL:', window.location.href);
console.log('[Backlog Tracker V6] 📊 Document state:', document.readyState);

if (window.location.href.includes('.backlog.')) {
  console.log('[Backlog Tracker V6] 🚀 Starting V6 webRequest + DOM analysis implementation');
  
  // すぐに初期化
  window.backlogTrackerV6 = new BacklogTaskTrackerV6();
  
  // 互換性のため
  window.backlogTrackerV5 = window.backlogTrackerV6;
  window.backlogTrackerV4 = window.backlogTrackerV6;
  
  console.log('[Backlog Tracker V6] ✅ Instance created and DOM monitoring active');
}

// デバッグ用関数をグローバルに公開
window.testBacklogTrackerV6 = () => {
  if (window.backlogTrackerV6) {
    window.backlogTrackerV6.debugCurrentState();
  }
};

window.debugBacklogTracker = window.testBacklogTrackerV6;