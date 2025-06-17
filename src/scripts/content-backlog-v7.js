class BacklogTaskTrackerV7 {
  constructor() {
    this.taskStates = new Map();        // タスクの現在状態
    this.pointerStartTask = null;      // ポインター開始タスク
    this.elementCache = new Map();     // DOM要素のキャッシュ
    this.processingQueue = [];         // 処理待ちキュー
    this.isProcessing = false;         // 処理中フラグ
    this.debugMode = true;             // デバッグモード
    
    // イベントドリブン + 効率的DOM解析
    this.setupPointerMonitoring();
    this.setupMutationObserver();
    this.initializeTaskStates();
    
    // 定期的なヘルスチェック
    this.setupHealthCheck();
  }
  
  setupPointerMonitoring() {
    document.addEventListener('pointerdown', (e) => {
      this.handlePointerDown(e);
    }, true);
    
    document.addEventListener('pointermove', (e) => {
      this.handlePointerMove(e);
    }, true);
    
    document.addEventListener('pointerup', (e) => {
      this.handlePointerUp(e);
    }, true);
    
    this.setupReactDndMonitoring();
  }
  
  setupReactDndMonitoring() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'data-react-beautiful-dnd-drag-handle' ||
             mutation.attributeName === 'data-react-beautiful-dnd-draggable')) {
          this.scheduleTaskCheck(mutation.target);
        }
      });
    });
    
    if (document.body) {
      observer.observe(document.body, {
        attributes: true,
        subtree: true,
        attributeFilter: [
          'data-react-beautiful-dnd-drag-handle',
          'data-react-beautiful-dnd-draggable',
          'data-rbd-drag-handle-draggable-id',
          'data-rbd-draggable-id'
        ]
      });
    }
  }
  
  handlePointerDown(e) {
    const taskElement = this.findTaskElement(e.target);
    
    if (taskElement && this.isDraggable(taskElement)) {
      const task = this.extractTaskFromElement(taskElement);
      if (task) {
        this.pointerStartTask = task;
      }
    }
  }
  
  handlePointerMove(e) {
    // ポインター移動中の処理（必要に応じて実装）
  }
  
  handlePointerUp(e) {
    if (this.pointerStartTask) {
      setTimeout(() => {
        this.processDragCompletion('pointerup');
      }, 50);
    }
  }
  
  processDragCompletion(eventType) {
    if (!this.pointerStartTask) return;
    
    console.log(`[Backlog Tracker V7] 🎯 Drag completed via ${eventType}, checking status change...`);
    
    const originalTask = this.pointerStartTask;
    this.pointerStartTask = null;
    
    // 少し待ってからDOM更新をチェック
    setTimeout(() => {
      this.checkSingleTaskChange(originalTask);
    }, 100);
    
    setTimeout(() => {
      this.checkSingleTaskChange(originalTask);
    }, 300);
    
    setTimeout(() => {
      this.checkSingleTaskChange(originalTask);
    }, 600);
  }
  
  async checkSingleTaskChange(originalTask) {
    
    try {
      // 元の要素を再評価
      let currentElement = originalTask.element;
      
      // 要素が無効になっている場合は再検索
      if (!currentElement || !document.contains(currentElement)) {
        currentElement = this.findTaskElementById(originalTask.id, originalTask.issueKey);
      }
      
      if (currentElement) {
        const currentTask = this.extractTaskFromElement(currentElement);
        
        if (currentTask && currentTask.status !== originalTask.status) {
          console.log(`[Backlog Tracker V7] ✅ Status change detected: ${originalTask.status} → ${currentTask.status}`);
          
          await this.handleTaskStatusChange({
            taskId: originalTask.id,
            oldStatus: originalTask.status,
            newStatus: currentTask.status,
            taskTitle: currentTask.title,
            issueKey: currentTask.issueKey,
            spaceId: currentTask.spaceId
          });
          
          // 状態を更新
          this.taskStates.set(originalTask.id, currentTask.status);
        }
      } else {
      }
    } catch (error) {
      console.error('[Backlog Tracker V7] Error checking task change:', error);
    }
  }
  
  findTaskElement(element) {
    // 要素から最も近いタスク要素を探す
    let current = element;
    
    for (let i = 0; i < 15; i++) {
      if (!current) break;
      
      // タスク要素の特徴をチェック
      if (this.isTaskElement(current)) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    return null;
  }
  
  isTaskElement(element) {
    if (!element) return false;
    
    // data属性チェック
    if (element.hasAttribute('data-issue-key') ||
        element.hasAttribute('data-react-beautiful-dnd-draggable') ||
        element.hasAttribute('data-rbd-draggable-id')) {
      return true;
    }
    
    // クラス名チェック
    const className = element.className || '';
    if (typeof className === 'string') {
      if (className.includes('card') || 
          className.includes('issue') || 
          className.includes('kanban') ||
          className.includes('draggable')) {
        return true;
      }
    }
    
    // draggable属性チェック
    if (element.getAttribute('draggable') === 'true') {
      return true;
    }
    
    // issueKey pattern in text
    const text = element.textContent || '';
    if (/[A-Z]+-\d+/.test(text)) {
      return true;
    }
    
    return false;
  }
  
  isDraggable(element) {
    // React Beautiful DnD attributes check (highest priority)
    if (element.hasAttribute('data-react-beautiful-dnd-draggable') || 
        element.hasAttribute('data-react-beautiful-dnd-drag-handle') ||
        element.hasAttribute('data-rbd-drag-handle-draggable-id')) {
      return true;
    }
    
    return element.getAttribute('draggable') === 'true';
  }
  
  findTaskElementById(taskId, issueKey) {
    // IDまたはissueKeyでタスク要素を検索
    
    // data属性での検索
    if (issueKey) {
      const byIssueKey = document.querySelector(`[data-issue-key="${issueKey}"]`);
      if (byIssueKey) return byIssueKey;
    }
    
    // テキスト内容での検索
    const allElements = document.querySelectorAll('*[draggable="true"], *[class*="card"], *[class*="issue"]');
    
    for (const element of allElements) {
      const task = this.extractTaskFromElement(element);
      if (task && (task.id === taskId || task.issueKey === issueKey)) {
        return element;
      }
    }
    
    return null;
  }
  
  extractTaskFromElement(element) {
    try {
      if (!element) return null;
      
      // キャッシュから取得を試行
      const cacheKey = this.getElementCacheKey(element);
      if (this.elementCache.has(cacheKey)) {
        const cached = this.elementCache.get(cacheKey);
        // キャッシュが新しい場合は使用（5秒以内）
        if (Date.now() - cached.timestamp < 5000) {
          return cached.task;
        }
      }
      
      // issueKeyの抽出
      let issueKey = element.getAttribute('data-issue-key') ||
                    element.getAttribute('data-issue') ||
                    element.getAttribute('data-rbd-draggable-id');
      
      if (!issueKey) {
        const text = element.textContent || '';
        const match = text.match(/([A-Z]+-\d+)/);
        if (match) {
          issueKey = match[1];
        }
      }
      
      // タイトルの抽出
      let title = element.getAttribute('title') ||
                 element.getAttribute('aria-label') ||
                 'Unknown Task';
      
      if (title === 'Unknown Task') {
        const textContent = element.textContent?.trim() || '';
        if (issueKey && textContent.includes(issueKey)) {
          title = textContent.replace(issueKey, '').trim();
        } else {
          const lines = textContent.split('\n').filter(line => line.trim());
          title = lines[0]?.trim() || 'Unknown Task';
        }
      }
      
      // ステータスの判定
      const status = this.determineTaskStatus(element);
      
      // タスクIDの生成
      const taskId = issueKey ? `backlog-${issueKey}` : `backlog-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      
      const task = {
        id: taskId,
        issueKey: issueKey,
        title: title.substring(0, 100),
        status: status,
        element: element,
        spaceId: this.getSpaceId(),
        timestamp: Date.now()
      };
      
      // 有効なタスクの場合はキャッシュに保存
      if (task.title !== 'Unknown Task' && task.status !== 'Unknown') {
        this.elementCache.set(cacheKey, {
          task: task,
          timestamp: Date.now()
        });
        
        // キャッシュサイズ制限
        if (this.elementCache.size > 100) {
          const oldestKey = this.elementCache.keys().next().value;
          this.elementCache.delete(oldestKey);
        }
        
        return task;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
  
  getElementCacheKey(element) {
    // 要素の一意キーを生成
    return element.outerHTML.substring(0, 200) + '_' + element.getBoundingClientRect().top;
  }
  
  determineTaskStatus(element) {
    // 効率的なステータス判定
    let current = element;
    
    for (let i = 0; i < 8; i++) {
      if (!current) break;
      
      // data属性から直接取得
      const dataStatus = current.getAttribute('data-status') ||
                        current.getAttribute('data-column') ||
                        current.getAttribute('data-column-id');
      
      if (dataStatus) {
        return this.normalizeStatus(dataStatus);
      }
      
      // 親要素のヘッダーテキストを確認
      const headers = current.querySelectorAll('h1, h2, h3, h4, *[class*="header"], *[class*="title"], *[class*="column"]');
      for (const header of headers) {
        const headerText = header.textContent?.trim();
        if (headerText && this.isValidStatus(headerText)) {
          return this.normalizeStatus(headerText);
        }
      }
      
      current = current.parentElement;
    }
    
    // 位置ベースの判定
    return this.getStatusFromPosition(element);
  }
  
  getStatusFromPosition(element) {
    try {
      const rect = element.getBoundingClientRect();
      
      // 画面上の同じ列にあるヘッダーを探す
      const columnHeaders = document.querySelectorAll('*[class*="column"], *[class*="header"], h1, h2, h3, h4');
      
      for (const header of columnHeaders) {
        const headerRect = header.getBoundingClientRect();
        
        // 水平方向で重複 && 垂直方向で上にある
        if (headerRect.left <= rect.right && 
            headerRect.right >= rect.left && 
            headerRect.top <= rect.top) {
          
          const headerText = header.textContent?.trim();
          if (headerText && this.isValidStatus(headerText)) {
            return this.normalizeStatus(headerText);
          }
        }
      }
    } catch (error) {
    }
    
    return 'Unknown';
  }
  
  isValidStatus(text) {
    if (!text) return false;
    
    const statusKeywords = [
      '処理中', '進行中', 'progress', 'doing', 'in progress',
      '完了', '終了', 'done', 'complete', 'finished', 'closed',
      '未対応', '新規', 'todo', 'open', 'new', 'backlog',
      'レビュー', 'review', 'testing', 'テスト'
    ];
    
    const lowerText = text.toLowerCase();
    return statusKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }
  
  normalizeStatus(rawStatus) {
    if (!rawStatus) return 'Unknown';
    
    const status = rawStatus.toString().toLowerCase();
    
    // 数字とマークを除去
    const cleaned = rawStatus.replace(/[\d\(\)\[\]]/g, '').trim();
    
    if (status.includes('処理') || status.includes('progress') || status.includes('doing')) {
      return '処理中';
    }
    if (status.includes('完了') || status.includes('done') || status.includes('complete')) {
      return '完了';
    }
    if (status.includes('未対応') || status.includes('todo') || status.includes('open') || status.includes('new')) {
      return '未対応';
    }
    if (status.includes('review') || status.includes('レビュー')) {
      return 'レビュー';
    }
    
    return cleaned || 'Unknown';
  }
  
  setupMutationObserver() {
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        if (this.isRelevantMutation(mutation)) {
          this.scheduleTaskCheck(mutation.target);
        }
      });
    });
    
    const startObserver = () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'data-status', 'data-column', 'style']
      });
    };
    
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startObserver);
    }
  }
  
  isRelevantMutation(mutation) {
    const target = mutation.target;
    
    // タスク関連の要素かチェック
    if (this.isTaskElement(target) || this.findTaskElement(target)) {
      return true;
    }
    
    // クラス名やスタイルの変更
    if (mutation.type === 'attributes') {
      const className = target.className || '';
      if (typeof className === 'string') {
        return className.includes('card') || 
               className.includes('issue') || 
               className.includes('kanban') ||
               className.includes('column');
      }
    }
    
    return false;
  }
  
  scheduleTaskCheck(element) {
    // 処理キューに追加（重複防止）
    if (!this.processingQueue.find(item => item.element === element)) {
      this.processingQueue.push({
        element: element,
        timestamp: Date.now()
      });
    }
    
    // 非同期で処理
    this.processQueueAsync();
  }
  
  async processQueueAsync() {
    if (this.isProcessing || this.processingQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      // アイドル時間に処理
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          this.processQueue();
        });
      } else {
        setTimeout(() => {
          this.processQueue();
        }, 16);
      }
    } catch (error) {
      this.isProcessing = false;
    }
  }
  
  processQueue() {
    const now = Date.now();
    const itemsToProcess = this.processingQueue.splice(0, 5); // 一度に最大5個
    
    itemsToProcess.forEach(item => {
      // 古いアイテム（1秒以上）はスキップ
      if (now - item.timestamp < 1000) {
        const taskElement = this.findTaskElement(item.element);
        if (taskElement) {
          const task = this.extractTaskFromElement(taskElement);
          if (task) {
            const lastStatus = this.taskStates.get(task.id);
            if (lastStatus && lastStatus !== task.status) {
              this.handleTaskStatusChangeFromMutation(task, lastStatus);
            }
          }
        }
      }
    });
    
    this.isProcessing = false;
    
    // まだキューに残りがある場合は継続
    if (this.processingQueue.length > 0) {
      setTimeout(() => {
        this.processQueueAsync();
      }, 100);
    }
  }
  
  async handleTaskStatusChangeFromMutation(task, oldStatus) {
    await this.handleTaskStatusChange({
      taskId: task.id,
      oldStatus: oldStatus,
      newStatus: task.status,
      taskTitle: task.title,
      issueKey: task.issueKey,
      spaceId: task.spaceId
    });
    
    this.taskStates.set(task.id, task.status);
  }
  
  async initializeTaskStates() {
    
    // 初期化は軽量に実行
    const initializeWhenReady = () => {
      try {
        
        const selectors = [
          '*[data-issue-key]',
          '*[draggable="true"]', 
          '*[class*="card"]',
          '*[class*="issue"]',
          '*[class*="kanban"]',
          '*[data-react-beautiful-dnd-draggable]'
        ];
        
        let allTaskElements = [];
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          allTaskElements.push(...Array.from(elements));
        });
        
        // 重複を除去
        const uniqueElements = [...new Set(allTaskElements)];
        
        // 最大50個まで初期化（パフォーマンス考慮）
        const elementsToProcess = uniqueElements.slice(0, 50);
        
        elementsToProcess.forEach((element) => {
          const task = this.extractTaskFromElement(element);
          if (task) {
            this.taskStates.set(task.id, task.status);
          }
        });
        
      } catch (error) {
      }
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeWhenReady);
    } else {
      setTimeout(initializeWhenReady, 1000);
    }
  }
  
  async handleTaskStatusChange(changeInfo) {
    
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
      });
    } catch (error) {
    }
  }
  
  getSpaceId() {
    const urlMatch = window.location.href.match(/https?:\/\/([^.]+)\.backlog\.(com|jp)/);
    return urlMatch ? urlMatch[1] : 'unknown-space';
  }
  
  getProjectName() {
    const urlMatch = window.location.href.match(/\/board\/([^\/\?]+)/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
  }
  
  // ヘルスチェック機能を追加
  setupHealthCheck() {
    // ヘルスチェックを無効化（デバッグ時の混乱を避けるため）
    // console.log('[Backlog Tracker V7] 🩺 Setting up health check...');
  }
  
  performHealthCheck() {
    // ヘルスチェックログを無効化
  }

  // デバッグ用メソッド
  debugCurrentState() {
    // デバッグログを無効化
  }
  
  forceTaskScan() {
    this.taskStates.clear();
    this.elementCache.clear();
    this.initializeTaskStates();
  }
}

// 初期化
if (window.location.href.includes('.backlog.')) {
  window.backlogTrackerV7 = new BacklogTaskTrackerV7();
  
  // 互換性のため
  window.backlogTrackerV6 = window.backlogTrackerV7;
  window.backlogTrackerV5 = window.backlogTrackerV7;
  window.backlogTrackerV4 = window.backlogTrackerV7;
}

// デバッグ用関数
window.debugBacklogTracker = () => {
  if (window.backlogTrackerV7) {
    window.backlogTrackerV7.debugCurrentState();
  }
};

window.forceBacklogScan = () => {
  if (window.backlogTrackerV7) {
    window.backlogTrackerV7.forceTaskScan();
  }
};