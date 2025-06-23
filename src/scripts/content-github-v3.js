class GitHubTaskTrackerV3 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.draggedCardInfo = null;
    this.lastKnownStatus = new Map();
    this.isDisabled = false; // Extension context無効化フラグ
    this.trackingStatus = null; // ユーザー設定の計測対象ステータス
    
    // Backlog方式の検知システム
    this.detectionStats = {
      mutation: 0,
      pointer: 0
    };

    // 即座検知とデバウンス用の状態管理
    this.immediateMode = false;
    this.pendingChanges = new Map(); // taskId -> {timestamp, changeInfo}
    this.changeTimestamps = new Map(); // taskId -> timestamp
    this.recentNotifications = new Map(); // taskId -> {timestamp, changeInfo}
    this.debounceDelay = 2000; // 2秒内の重複変更を防ぐ
    
    // GitHub SPA のネットワークリクエストを監視
    this.originalFetch = window.fetch;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    
    // Extension contextの状態をチェック
    this.checkExtensionContext();

    // 設定を読み込んでからメイン機能を初期化
    this.loadSettings().then(() => {
      this.init();
    });
    
    this.setupBackgroundMessageListener();
  }

  checkExtensionContext() {
    // Extension context が無効化されているかチェック
    if (!chrome.runtime?.id) {
      console.warn('[GitHub] Extension context is already invalidated at startup');
      this.disableTracker();
      return;
    }

  }

  setupBackgroundMessageListener() {
    // 必要に応じて将来的にメッセージリスナーを追加
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.local.get(['settings']);
      this.trackingStatus = result.settings?.trackingStatuses?.github?.start?.[0] || null;
      console.log('[GitHub] Tracking status loaded:', this.trackingStatus);
      console.log('[GitHub] Full settings:', result.settings?.trackingStatuses);
    } catch (error) {
      console.warn('[GitHub] Failed to load settings:', error);
      this.trackingStatus = null;
    }
  }

  init() {
    this.setupMutationObserver();
    this.setupPointerMonitoring();
    
    // DOM要素の存在を確認してから状態初期化
    this.waitForBoardElements().then(() => {
      this.initializeTaskStates();
    });
  }

  async waitForBoardElements() {
    // GitHub Projects の動的コンテンツロードを待つ
    return new Promise((resolve) => {
      const checkBoardElements = () => {
        const hasColumns = document.querySelector('[data-board-column]') !== null;
        const hasCards = document.querySelector('[data-board-card-id]') !== null;
        
        if (hasColumns) {
          resolve();
        } else {
          // 最大5秒待機
          setTimeout(checkBoardElements, 500);
        }
      };
      
      // 初回チェック
      if (document.readyState === 'complete') {
        setTimeout(checkBoardElements, 100);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          setTimeout(checkBoardElements, 100);
        });
      }
    });
  }

  // ==========================================
  // Mutation Observer監視（Backlog方式）
  // ==========================================
  
  setupMutationObserver() {
    
    this.observer = new MutationObserver((mutations) => {
      this.processMutationsInBatch(mutations);
    });
    
    // document.bodyが存在するまで待機
    const startObserver = () => {
      if (document.body) {
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-board-column', 'class']
        });
      } else {
        setTimeout(startObserver, 100);
      }
    };
    
    startObserver();
  }

  shouldProcessMutation(mutation) {
    const target = mutation.target;
    
    // data-board-column属性の変更（GitHub特有）
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-board-column') {
      return true;
    }
    
    // class属性の変更
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      if (this.isGitHubCardElement(target) || this.isGitHubColumnElement(target)) {
        return true;
      }
    }
    
    // 子要素の追加・削除（カードの移動や新規作成）
    if (mutation.type === 'childList') {
      // 列コンテナレベルでの変更を優先監視
      if (this.isGitHubColumnElement(target)) {
        return true;
      }
      
      // 追加された要素をチェック
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && this.isGitHubCardElement(node)) {
          return true;
        }
      }
      
      // 削除された要素をチェック
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && this.isGitHubCardElement(node)) {
          return true;
        }
      }
      
      // GitHub Projects関連コンテナ内での変更
      if (this.isGitHubBoardElement(target)) {
        return true;
      }
    }
    
    return false;
  }

  isGitHubCardElement(element) {
    if (!element || element.nodeType !== 1) return false;
    
    // data-board-card-id属性を持つ要素（GitHub Projects特有）
    if (element.hasAttribute('data-board-card-id')) {
      return true;
    }
    
    // GitHub Projectsのカードクラス
    const className = element.className || '';
    if (typeof className === 'string') {
      if (className.includes('board-view-column-card') ||
          className.includes('index-module__CardBaseWithSash') ||
          className.includes('card-base__CardBase')) {
        return true;
      }
    }
    
    // Issueリンクを持つ要素での判定
    if (element.querySelector('a[href*="/issues/"]') ||
        element.querySelector('a[href*="/pull/"]')) {
      return true;
    }
    
    return false;
  }

  isGitHubColumnElement(element) {
    if (!element || element.nodeType !== 1) return false;
    
    // data-board-column属性を持つ要素（列のコンテナ）
    if (element.hasAttribute('data-board-column')) {
      return true;
    }
    
    // DnD関連の属性（ドロップ可能な領域）
    if (element.hasAttribute('data-dnd-drop-type')) {
      return true;
    }
    
    // 列コンテナのクラス名での判定
    const className = element.className || '';
    if (typeof className === 'string') {
      if (className.includes('column-frame-module') ||
          className.includes('column-drop-zone') ||
          (className.includes('Box') && className.includes('column'))) {
        return true;
      }
    }
    
    return false;
  }

  isGitHubBoardElement(element) {
    const className = element.className || '';
    if (typeof className === 'string') {
      // GitHub Projects関連クラス
      if (className.includes('board') ||
          className.includes('column') ||
          className.includes('card') ||
          className.includes('project')) {
        return true;
      }
    }
    
    // data属性での判定
    if (element.hasAttribute('data-board-column') ||
        element.hasAttribute('data-board-card-id') ||
        element.hasAttribute('data-dnd-drop-type') ||
        element.hasAttribute('data-dnd-drag-type')) {
      return true;
    }
    
    return false;
  }

  processMutationsInBatch(mutations) {
    // Extension context無効化チェック
    if (this.isDisabled) {
      return;
    }
    
    if (this.immediateMode) {
      // 即座検知モード: バッチ処理をスキップして即座に処理
      this.processImmediateMutations(mutations);
    } else {
      // 通常モード: リクエストアニメーションフレームで効率的に処理
      requestAnimationFrame(() => {
        this.processNormalMutations(mutations);
      });
    }
  }

  processImmediateMutations(mutations) {
    const processedElements = new Set();
    const processedColumns = new Set();
    
    mutations.forEach(mutation => {
      if (!this.shouldProcessMutation(mutation)) return;
      
      const element = mutation.target;
      
      // 列コンテナの変更の場合、その列内の全タスクをチェック
      if (this.isGitHubColumnElement(element) && !processedColumns.has(element)) {
        processedColumns.add(element);
        this.scanAllTasksInColumn(element, 'column-immediate');
      }
      // 通常のタスク要素の変更
      else if (!processedElements.has(element)) {
        processedElements.add(element);
        this.checkElementStatusChangeWithDebounce(element, 'immediate');
      }
    });
  }

  processNormalMutations(mutations) {
    const processedElements = new Set();
    const processedColumns = new Set();
    
    mutations.forEach(mutation => {
      if (!this.shouldProcessMutation(mutation)) return;
      
      const element = mutation.target;
      
      // 列コンテナの変更の場合、その列内の全タスクをチェック
      if (this.isGitHubColumnElement(element) && !processedColumns.has(element)) {
        processedColumns.add(element);
        this.scanAllTasksInColumn(element, 'column-batch');
      }
      // 通常のタスク要素の変更
      else if (!processedElements.has(element)) {
        processedElements.add(element);
        this.checkElementStatusChangeWithDebounce(element, 'batch');
      }
    });
  }

  scanAllTasksInColumn(columnElement, detectionSource) {
    // 列内の全タスクカード要素を取得
    const taskElements = columnElement.querySelectorAll('[data-board-card-id], [class*="card"], [class*="CardBase"]');
    
    
    taskElements.forEach(taskElement => {
      if (this.isGitHubCardElement(taskElement)) {
        this.checkElementStatusChangeWithDebounce(taskElement, detectionSource);
      }
    });
    
    // 列内にタスクがない場合でも、削除されたタスクがないかチェック
    if (taskElements.length === 0) {
      this.checkForRemovedTasks(columnElement);
    }
  }

  checkForRemovedTasks(columnElement) {
    // 現在のタスク状態と実際のDOM要素を比較し、削除されたタスクを検出
    const currentTaskIds = new Set();
    const allCurrentTasks = document.querySelectorAll('[data-board-card-id], [class*="card"], [class*="CardBase"]');
    
    allCurrentTasks.forEach(taskElement => {
      const task = this.extractTaskFromElement(taskElement);
      if (task) {
        currentTaskIds.add(task.id);
      }
    });
    
    // 記録されているタスクIDのうち、現在DOM上に存在しないものを検出
    const removedTasks = [];
    for (const [taskId, status] of this.lastKnownStatus.entries()) {
      if (!currentTaskIds.has(taskId)) {
        removedTasks.push({ taskId, status });
      }
    }
    
    if (removedTasks.length > 0) {
      // 削除されたタスクの状態をクリア
      removedTasks.forEach(({ taskId }) => {
        this.lastKnownStatus.delete(taskId);
        this.changeTimestamps.delete(taskId);
      });
    }
  }

  checkElementStatusChangeWithDebounce(element, detectionSource) {
    // 対象要素とその関連要素をチェック
    const elementsToCheck = this.getElementsToCheck(element);
    
    elementsToCheck.forEach(targetElement => {
      const task = this.extractTaskFromElement(targetElement);
      if (!task) return;
      
      const now = Date.now();
      const lastChangeTime = this.changeTimestamps.get(task.id) || 0;
      
      // デバウンス: 短時間での重複変更をスキップ
      if (now - lastChangeTime < this.debounceDelay) {
        return;
      }
      
      const oldStatus = this.lastKnownStatus.get(task.id);
      
      if (oldStatus && oldStatus !== task.status) {
        this.changeTimestamps.set(task.id, now);
        
        // ユーザー設定のステータスと比較して計測開始/終了を判定
        const isTrackingStart = (task.status === this.trackingStatus);
        const isTrackingEnd = (oldStatus === this.trackingStatus && task.status !== this.trackingStatus);
        
        console.log(`[GitHub] Status change: "${oldStatus}" → "${task.status}" (tracking: "${this.trackingStatus}", start: ${isTrackingStart}, end: ${isTrackingEnd})`);
        
        if (isTrackingStart || isTrackingEnd) {
          const changeInfo = {
            taskId: task.id,
            oldStatus: oldStatus,
            newStatus: task.status,
            taskTitle: task.title,
            issueKey: task.issueKey,
            projectName: task.projectName,
            detectionMethod: 'mutation',
            detectionSource: detectionSource,
            timestamp: now,
            isTrackingStart: isTrackingStart,
            isTrackingEnd: isTrackingEnd
          };
          
          this.notifyStatusChange(changeInfo);
        }
      }
      
      this.lastKnownStatus.set(task.id, task.status);
    });
  }

  getElementsToCheck(element) {
    const elementsToCheck = [element];
    
    // 親要素もチェック（最大3レベル上まで）
    let parent = element.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (this.isGitHubCardElement(parent) || this.isGitHubBoardElement(parent)) {
        elementsToCheck.push(parent);
      }
      parent = parent.parentElement;
    }
    
    // 子要素もチェック（カード要素を含む子要素）
    const childCards = element.querySelectorAll('[data-board-card-id], [class*="card"], [class*="CardBase"]');
    childCards.forEach(child => {
      if (this.isGitHubCardElement(child)) {
        elementsToCheck.push(child);
      }
    });
    
    // 兄弟要素もチェック（列内の他のタスク）
    if (this.isGitHubColumnElement(element.parentElement)) {
      const siblingCards = element.parentElement.querySelectorAll('[data-board-card-id], [class*="card"], [class*="CardBase"]');
      siblingCards.forEach(sibling => {
        if (this.isGitHubCardElement(sibling) && sibling !== element) {
          elementsToCheck.push(sibling);
        }
      });
    }
    
    // 重複を除去
    return [...new Set(elementsToCheck)];
  }

  notifyStatusChange(changeInfo) {
    const now = Date.now();
    const notificationKey = `${changeInfo.taskId}_${changeInfo.oldStatus}_${changeInfo.newStatus}`;
    const lastNotification = this.recentNotifications.get(notificationKey);
    
    // 同じ変更が最近送信されている場合はスキップ（5秒間）
    if (lastNotification && (now - lastNotification.timestamp) < 5000) {
      return;
    }
    
    this.recentNotifications.set(notificationKey, {
      timestamp: now,
      changeInfo: changeInfo
    });
    
    // 古い通知履歴を削除（10秒以上古いもの）
    const tenSecondsAgo = now - 10000;
    for (const [key, notification] of this.recentNotifications.entries()) {
      if (notification.timestamp < tenSecondsAgo) {
        this.recentNotifications.delete(key);
      }
    }
    
    this.sendStatusChange({
      taskId: changeInfo.taskId,
      newStatus: changeInfo.newStatus,
      oldStatus: changeInfo.oldStatus,
      service: 'github',
      taskTitle: changeInfo.taskTitle,
      projectName: changeInfo.projectName,
      issueKey: changeInfo.issueKey
    });
  }

  extractTaskFromElement(element) {
    if (!this.isGitHubCardElement(element)) return null;
    
    const cardId = element.getAttribute('data-board-card-id');
    if (!cardId) return null;
    
    const column = this.getColumnFromCard(element);
    
    // github-page.htmlの実際の構造に基づく要素取得
    const issueKeyElement = element.querySelector('.header-module__Text--apTHb');
    // 複数のタイトルセレクタに対応（通常状態とMerged状態）
    const titleElement = element.querySelector('.title-module__SanitizedHtml_1--dvKYp') ||
                        element.querySelector('.prc-Text-Text-0ima0');
    
    const fullIssueText = issueKeyElement ? issueKeyElement.textContent.trim() : null;
    const title = titleElement ? titleElement.textContent.trim() : null;
    
    // fullIssueTextから#6部分を抽出（例: "tomica-vault #6" → "#6"）
    let issueKey = null;
    let projectName = null;
    
    if (fullIssueText) {
      const match = fullIssueText.match(/^(.+?)\s+(#\d+)$/);
      if (match) {
        projectName = match[1]; // "tomica-vault"
        issueKey = match[2];    // "#6"
      } else {
        // フォールバック: 全体をissueKeyとして使用
        issueKey = fullIssueText;
      }
    }
    
    // issueKeyが見つからない場合はフォールバック
    const fallbackIssueKey = issueKey || `#${cardId}`;
    
    return {
      id: cardId,
      status: column,
      title: title || fallbackIssueKey,
      issueKey: fallbackIssueKey,
      projectName: projectName,
      spaceId: null,
      service: 'github'
    };
  }

  initializeTaskStates() {
    
    const cardElements = document.querySelectorAll('[data-board-card-id]');
    
    cardElements.forEach(cardElement => {
      const task = this.extractTaskFromElement(cardElement);
      if (task) {
        this.lastKnownStatus.set(task.id, task.status);
        
        this.sendTaskInitialized({
          taskId: task.id,
          status: task.status,
          taskTitle: task.title,
          issueKey: task.issueKey,
          projectName: task.projectName
        });
      }
    });
  }

  // ==========================================
  // ポインター監視（Backlog方式）
  // ==========================================
  
  setupPointerMonitoring() {
    
    this.pointerStartTask = null;
    
    document.addEventListener('pointerdown', (e) => {
      this.handlePointerDown(e);
    }, true);
    
    document.addEventListener('pointerup', (e) => {
      this.handlePointerUp(e);
    }, true);
  }

  handlePointerDown(e) {
    const taskElement = this.findTaskElement(e.target);
    if (taskElement && this.isDraggable(taskElement)) {
      const task = this.extractTaskFromElement(taskElement);
      if (task) {
        this.pointerStartTask = task;
        // ドラッグ開始時に即座検知モードを有効化
        this.immediateMode = true;
      }
    }
  }

  handlePointerUp(e) {
    if (this.pointerStartTask) {
      
      setTimeout(() => {
        this.processPointerDragCompletion();
      }, 150);
      
      // 即座検知モードを少し遅延させて無効化（Mutation検知との協調のため）
      setTimeout(() => {
        this.immediateMode = false;
      }, 1000);
    }
  }

  processPointerDragCompletion() {
    if (!this.pointerStartTask) return;
    
    const originalTask = this.pointerStartTask;
    this.pointerStartTask = null;
    
    // 複数回チェック
    [100, 300, 600].forEach(delay => {
      setTimeout(() => {
        this.checkPointerTaskChange(originalTask);
      }, delay);
    });
  }

  checkPointerTaskChange(originalTask) {
    const currentElement = this.findTaskElementById(originalTask.id, originalTask.issueKey);
    
    if (currentElement) {
      const currentTask = this.extractTaskFromElement(currentElement);
      
      if (currentTask && currentTask.status !== originalTask.status) {
        const now = Date.now();
        const lastChangeTime = this.changeTimestamps.get(currentTask.id) || 0;
        
        // ポインター検知もデバウンスを適用
        if (now - lastChangeTime < this.debounceDelay) {
          return;
        }
        
        this.changeTimestamps.set(currentTask.id, now);
        
        // ユーザー設定のステータスと比較して計測開始/終了を判定
        const isTrackingStart = (currentTask.status === this.trackingStatus);
        const isTrackingEnd = (originalTask.status === this.trackingStatus && currentTask.status !== this.trackingStatus);
        
        console.log(`[GitHub] Pointer status change: "${originalTask.status}" → "${currentTask.status}" (tracking: "${this.trackingStatus}", start: ${isTrackingStart}, end: ${isTrackingEnd})`);
        
        if (isTrackingStart || isTrackingEnd) {
          const changeInfo = {
            taskId: originalTask.id,
            oldStatus: originalTask.status,
            newStatus: currentTask.status,
            taskTitle: currentTask.title,
            issueKey: currentTask.issueKey,
            projectName: currentTask.projectName,
            detectionMethod: 'pointer',
            detectionSource: 'drag-drop',
            timestamp: now,
            isTrackingStart: isTrackingStart,
            isTrackingEnd: isTrackingEnd
          };
          
          this.notifyStatusChange(changeInfo);
        }
        
        this.lastKnownStatus.set(originalTask.id, currentTask.status);
      }
    }
  }

  // ==========================================
  // 共通ユーティリティ
  // ==========================================
  
  findTaskElement(element) {
    let current = element;
    
    for (let i = 0; i < 10; i++) {
      if (!current) break;
      
      if (this.isGitHubCardElement(current)) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    return null;
  }

  findTaskElementById(taskId, issueKey) {
    // まずIDで検索
    const elementById = document.querySelector(`[data-board-card-id="${taskId}"]`);
    if (elementById) return elementById;
    
    // issueKeyでも検索
    if (issueKey) {
      const allCards = document.querySelectorAll('[data-board-card-id]');
      for (const card of allCards) {
        const cardTask = this.extractTaskFromElement(card);
        if (cardTask && cardTask.issueKey === issueKey) {
          return card;
        }
      }
    }
    
    return null;
  }

  isDraggable(element) {
    // GitHub Projectsのドラッグ可能要素の判定
    return element.hasAttribute('data-board-card-id') ||
           element.getAttribute('role') === 'button' ||
           element.hasAttribute('draggable');
  }

  getColumnFromCard(cardElement) {
    // カード要素から親の列情報を取得
    let currentElement = cardElement;
    
    while (currentElement && currentElement !== document.body) {
      const boardColumn = currentElement.getAttribute('data-board-column');
      if (boardColumn) {
        return boardColumn;
      }
      currentElement = currentElement.parentElement;
    }
    
    return null;
  }

  isGitHubProjectsBoard() {
    // GitHub Projectsのボードページかどうかを判定
    return window.location.pathname.includes('/projects/');
  }

  sendStatusChange(data) {
    
    // Extension context が無効化されているかチェック
    if (!chrome.runtime?.id) {
      console.warn('[GitHub] Extension context invalidated, skipping status change notification');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: data
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[GitHub] Failed to send status change message:', {
            error: chrome.runtime.lastError.message,
            data: data
          });
          
          // Extension context が無効化された場合
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.disableTracker();
          }
        } else {
        }
      });
    } catch (error) {
      console.error('[GitHub] Exception while sending status change:', error);
      if (error.message.includes('Extension context invalidated')) {
        this.disableTracker();
      }
    }
  }

  sendTaskInitialized(data) {
    // Extension context が無効化されているかチェック
    if (!chrome.runtime?.id) {
      console.warn('[GitHub] Extension context invalidated, skipping task initialization');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'TASK_INITIALIZED',
        data: {
          taskId: data.taskId,
          status: data.status,
          service: 'github',
          taskTitle: data.taskTitle,
          projectName: data.projectName,
          issueKey: data.issueKey
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('[GitHub] Failed to send task initialization:', {
            error: chrome.runtime.lastError.message,
            data: data
          });
          
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.disableTracker();
          }
        }
      });
    } catch (error) {
      console.error('[GitHub] Exception while sending task initialization:', error);
      if (error.message.includes('Extension context invalidated')) {
        this.disableTracker();
      }
    }
  }

  disableTracker() {
    this.isDisabled = true;
    
    // MutationObserver を停止
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // イベントリスナーを削除
    document.removeEventListener('pointerdown', this.handlePointerDown?.bind(this));
    document.removeEventListener('pointerup', this.handlePointerUp?.bind(this));
    
    
    // ユーザーにページリロードを促すバナーを表示
    this.showReloadBanner();
    
  }

  showReloadBanner() {
    // 既存のバナーがある場合は削除
    const existingBanner = document.getElementById('task-tracker-reload-banner');
    if (existingBanner) {
      existingBanner.remove();
    }

    // リロードバナーを作成
    const banner = document.createElement('div');
    banner.id = 'task-tracker-reload-banner';
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(90deg, #24292e, #586069);
      color: white;
      padding: 12px 20px;
      text-align: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      cursor: pointer;
      animation: slideDown 0.3s ease-out;
    `;

    banner.innerHTML = `
      ⚠️ タスクトラッカーが一時停止されました。ページをリロード(F5)してタスク追跡を再開してください。
      <span style="margin-left: 10px; text-decoration: underline;">クリックでリロード</span>
    `;

    // クリックでページリロード
    banner.addEventListener('click', () => {
      window.location.reload();
    });

    // 5秒後に自動で薄く表示
    setTimeout(() => {
      banner.style.opacity = '0.8';
    }, 5000);

    // アニメーション用CSS
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);

    document.body.prepend(banner);
    
  }
}

// GitHub Projects用のトラッカーを初期化
if (window.location.pathname.includes('/projects/')) {
  if (!window.githubTrackerV3) {
    window.githubTrackerV3 = new GitHubTaskTrackerV3();
  } else {
  }
} else {
}