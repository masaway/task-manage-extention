class BacklogTaskTrackerV8 {
  constructor() {
    this.taskStates = new Map();
    this.detectionMethods = {
      mutation: true,
      pointer: true
    };
    this.detectionStats = {
      mutation: 0,
      pointer: 0
    };

    // 即座検知とデバウンス用の状態管理
    this.immediateMode = false;
    this.pendingChanges = new Map(); // taskId -> {timestamp, changeInfo}
    this.changeTimestamps = new Map(); // taskId -> timestamp
    this.debounceDelay = 100; // 100ms内の重複変更を防ぐ

    // タスク検知システムを先に初期化
    this.setupMutationObserver();
    this.setupPointerMonitoring();
    this.initializeTaskStates();
    
    // バナー通知システムを後で初期化
    this.setupBannerNotification();
    this.setupBackgroundMessageListener();
  }

  setupBannerNotification() {
    // DOM readyを保証してからバナー通知システムを初期化
    this.ensureDOMReady().then(() => {
      console.log('[BacklogTracker] DOM ready confirmed, initializing banner notification');
      if (!window.taskTrackerBanner) {
        this.initializeBannerNotification();
      } else {
        console.log('[BacklogTracker] Banner notification already initialized');
      }
    });
  }

  async ensureDOMReady() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else if (document.readyState === 'interactive') {
        // インタラクティブなら50ms待ってから開始
        setTimeout(resolve, 50);
      } else {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      }
    });
  }

  initializeBannerNotification() {
    // バナー通知システムを直接初期化
    class BannerNotification {
      constructor() {
        this.currentBanner = null;
        this.bannerQueue = [];
        this.isShowing = false;
        this.setupStyles();
      }

      setupStyles() {
        if (document.getElementById('task-tracker-banner-styles')) return;

        console.log('[BacklogTracker] Setting up banner styles');
        
        // CSPに配慮してlinkタグでCSSファイルを読み込む
        const linkElement = document.createElement('link');
        linkElement.id = 'task-tracker-banner-styles';
        linkElement.rel = 'stylesheet';
        linkElement.type = 'text/css';
        linkElement.href = chrome.runtime.getURL('src/styles/banner-notification.css');
        document.head.appendChild(linkElement);
        
        console.log('[BacklogTracker] Banner styles loaded from external CSS');
        
        // フォールバック: CSSファイルが読み込めない場合はインラインで設定
        linkElement.onerror = () => {
          console.log('[BacklogTracker] External CSS failed, falling back to inline styles');
          this.setupInlineStyles();
        };
      }

      setupInlineStyles() {
        if (document.getElementById('task-tracker-banner-inline-styles')) return;
        
        const styles = `
          .task-tracker-banner {
            position: fixed;
            top: 20px;
            right: 20px;
            min-width: 320px;
            max-width: 450px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            transform: translateX(100%);
            transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }

          .task-tracker-banner.show {
            transform: translateX(0);
          }

          .task-tracker-banner.hide {
            transform: translateX(100%);
          }

          .task-tracker-banner-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px 12px 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }

          .task-tracker-banner-icon {
            font-size: 20px;
            margin-right: 8px;
          }

          .task-tracker-banner-title {
            display: flex;
            align-items: center;
            font-weight: 600;
            font-size: 15px;
          }

          .task-tracker-banner-close {
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-size: 18px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: all 0.2s;
          }

          .task-tracker-banner-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: white;
          }

          .task-tracker-banner-content {
            padding: 12px 20px 16px 20px;
          }

          .task-tracker-banner-task-title {
            font-weight: 600;
            margin-bottom: 4px;
            color: #f0f0f0;
          }

          .task-tracker-banner-details {
            color: rgba(255, 255, 255, 0.9);
            font-size: 13px;
          }

          .task-tracker-banner-duration {
            background: rgba(255, 255, 255, 0.15);
            display: inline-block;
            padding: 2px 8px;
            border-radius: 6px;
            font-weight: 500;
            margin-top: 6px;
          }

          .task-tracker-banner.start {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          }

          .task-tracker-banner.stop {
            background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
          }

          .task-tracker-banner-progress {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 0 0 12px 12px;
            animation: bannerProgress 4s linear forwards;
          }

          @keyframes bannerProgress {
            from { width: 100%; }
            to { width: 0%; }
          }

          .task-tracker-banner:hover .task-tracker-banner-progress {
            animation-play-state: paused;
          }

          @media (max-width: 768px) {
            .task-tracker-banner {
              top: 10px;
              right: 10px;
              left: 10px;
              min-width: auto;
              max-width: none;
            }
          }
        `;

        const styleSheet = document.createElement('style');
        styleSheet.id = 'task-tracker-banner-inline-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
      }

      show(options) {
        const { type, title, taskTitle, duration, projectName } = options;
        
        if (this.currentBanner) {
          this.hide(true);
        }

        this.bannerQueue.push({ type, title, taskTitle, duration, projectName });
        
        if (!this.isShowing) {
          this.showNext();
        }
      }

      showNext() {
        if (this.bannerQueue.length === 0) {
          this.isShowing = false;
          return;
        }

        this.isShowing = true;
        const options = this.bannerQueue.shift();
        this.createBanner(options);
      }

      createBanner({ type, title, taskTitle, duration, projectName }) {
        this.removeBanner();

        const banner = document.createElement('div');
        banner.className = `task-tracker-banner ${type}`;
        
        const icon = type === 'start' ? '⏰' : '✅';
        const titleText = title || (type === 'start' ? 'タスク計測開始' : 'タスク計測終了');
        
        let contentHTML = `
          <div class="task-tracker-banner-header">
            <div class="task-tracker-banner-title">
              <span class="task-tracker-banner-icon">${icon}</span>
              ${titleText}
            </div>
            <button class="task-tracker-banner-close">×</button>
          </div>
          <div class="task-tracker-banner-content">
            <div class="task-tracker-banner-task-title">${taskTitle || 'Unknown Task'}</div>
            <div class="task-tracker-banner-details">
        `;

        if (projectName) {
          contentHTML += `プロジェクト: ${projectName}<br>`;
        }

        if (type === 'start') {
          contentHTML += '時間計測を開始しました';
        } else if (type === 'stop' && duration) {
          contentHTML += `作業時間: <span class="task-tracker-banner-duration">${this.formatDuration(duration)}</span>`;
        } else {
          contentHTML += '時間計測を終了しました';
        }

        contentHTML += `
            </div>
          </div>
          <div class="task-tracker-banner-progress"></div>
        `;

        banner.innerHTML = contentHTML;
        
        banner.querySelector('.task-tracker-banner-close').addEventListener('click', () => {
          this.hide();
        });

        banner.addEventListener('click', () => {
          this.hide();
        });

        let hideTimeout;
        banner.addEventListener('mouseenter', () => {
          if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
          }
        });

        banner.addEventListener('mouseleave', () => {
          hideTimeout = setTimeout(() => {
            this.hide();
          }, 1000);
        });

        document.body.appendChild(banner);
        this.currentBanner = banner;

        setTimeout(() => {
          banner.classList.add('show');
        }, 50);

        hideTimeout = setTimeout(() => {
          this.hide();
        }, 4000);
      }

      hide(immediate = false) {
        if (!this.currentBanner) return;

        if (immediate) {
          this.removeBanner();
          this.showNext();
          return;
        }

        this.currentBanner.classList.add('hide');
        this.currentBanner.classList.remove('show');

        setTimeout(() => {
          this.removeBanner();
          this.showNext();
        }, 300);
      }

      removeBanner() {
        if (this.currentBanner) {
          if (this.currentBanner.parentNode) {
            this.currentBanner.parentNode.removeChild(this.currentBanner);
          }
          this.currentBanner = null;
        }
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

      async shouldShowBanner() {
        try {
          const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
          });
          
          if (response && response.success && response.settings) {
            return response.settings.bannerNotifications !== false;
          }
        } catch (error) {
          console.log('[Banner] Settings not available, using default behavior');
        }
        
        return true;
      }

      async showTaskStart(taskTitle, projectName) {
        if (await this.shouldShowBanner()) {
          this.show({
            type: 'start',
            taskTitle,
            projectName
          });
        }
      }

      async showTaskStop(taskTitle, duration, projectName) {
        if (await this.shouldShowBanner()) {
          this.show({
            type: 'stop',
            taskTitle,
            duration,
            projectName
          });
        }
      }
    }

    window.taskTrackerBanner = new BannerNotification();
  }

  setupBackgroundMessageListener() {
    // バナー通知専用のメッセージリスナーを追加
    if (!window.backlogBannerListenerAdded) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SHOW_BANNER_NOTIFICATION') {
          // Backlogサービスの通知のみ処理
          if (message.data && message.data.service === 'backlog') {
            console.log('[BacklogTracker] Processing banner notification for Backlog service');
            this.handleBannerNotification(message.data);
            sendResponse({ success: true, processed: true });
          } else {
            console.log('[BacklogTracker] Ignoring non-Backlog banner notification');
            sendResponse({ success: false, processed: false });
          }
          return true; // 非同期レスポンスを示す
        }
      });
      window.backlogBannerListenerAdded = true;
    }
  }

  async handleBannerNotification(data) {
    console.log('[BacklogTracker] handleBannerNotification called with:', data);
    const { type, taskTitle, duration, projectName } = data;
    
    if (window.taskTrackerBanner) {
      console.log('[BacklogTracker] Banner object available, showing notification');
      try {
        if (type === 'start') {
          console.log('[BacklogTracker] Showing start notification');
          await window.taskTrackerBanner.showTaskStart(taskTitle, projectName);
        } else if (type === 'stop') {
          console.log('[BacklogTracker] Showing stop notification');
          await window.taskTrackerBanner.showTaskStop(taskTitle, duration, projectName);
        } else {
          console.log('[BacklogTracker] Unknown notification type:', type);
        }
        console.log('[BacklogTracker] Banner notification processed successfully');
      } catch (error) {
        console.error('[BacklogTracker] Error showing banner notification:', error);
      }
    } else {
      console.error('[BacklogTracker] Banner object not available, cannot show notification');
      console.log('[BacklogTracker] Attempting to initialize banner now...');
      this.initializeBannerNotification();
      // Retry after initialization
      setTimeout(() => {
        if (window.taskTrackerBanner) {
          console.log('[BacklogTracker] Retrying banner notification after delayed initialization');
          this.handleBannerNotification(data);
        } else {
          console.error('[BacklogTracker] Banner initialization failed completely');
        }
      }, 100);
    }
  }


  // ==========================================
  // 1. DOM Mutation 監視
  // ==========================================
  
  setupMutationObserver() {
    
    const observer = new MutationObserver((mutations) => {
      this.handleMutations(mutations);
    });
    
    const startObserver = () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true, // CSS-in-JSクラス変更の比較のため
        attributeFilter: [
          'class', 'data-status', 'data-statusid', 'data-column', 'data-column-id',
          'data-issue-key', 'data-react-beautiful-dnd-draggable',
          'data-react-beautiful-dnd-drag-handle', 'data-rbd-draggable-id',
          'data-rbd-drag-handle-draggable-id', 'style'
        ]
      });
    };
    
    if (document.body) {
      startObserver();
    } else {
      document.addEventListener('DOMContentLoaded', startObserver);
    }
  }

  handleMutations(mutations) {
    const relevantMutations = mutations.filter(mutation => this.isRelevantMutation(mutation));
    
    if (relevantMutations.length > 0) {
      this.detectionStats.mutation += relevantMutations.length;
      
      // バッチ処理で効率化
      this.processMutationsInBatch(relevantMutations);
    }
  }

  isRelevantMutation(mutation) {
    const target = mutation.target;
    
    // CSS-in-JSクラスの変更を無視（パフォーマンス最適化）
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      const newClassName = target.className || '';
      const oldClassName = mutation.oldValue || '';
      
      // CSS-in-JSクラスのみの変更は無視
      if (typeof newClassName === 'string' && typeof oldClassName === 'string') {
        const newClasses = newClassName.split(' ').filter(c => !c.startsWith('css-'));
        const oldClasses = oldClassName.split(' ').filter(c => !c.startsWith('css-'));
        
        // CSS-in-JS以外のクラスに変更がない場合は無視
        if (JSON.stringify(newClasses.sort()) === JSON.stringify(oldClasses.sort())) {
          return false;
        }
      }
    }
    
    // カンバンカード関連の変更のみフィルタ
    if (this.isKanbanCardElement(target)) {
      return true;
    }
    
    // React Beautiful DnD属性の変更を優先監視
    if (mutation.type === 'attributes') {
      const attributeName = mutation.attributeName;
      
      // React Beautiful DnD関連属性（拡張監視）
      if (['data-react-beautiful-dnd-draggable', 
           'data-react-beautiful-dnd-drag-handle',
           'data-react-beautiful-dnd-droppable',
           'data-rbd-draggable-id',
           'data-rbd-drag-handle-draggable-id',
           'data-rbd-droppable-id'].includes(attributeName)) {
        console.log(`[Backlog] React Beautiful DnD attribute change: ${attributeName} on`, target);
        return true;
      }
      
      // 重要なステータス関連属性
      if (['data-status', 'data-statusid', 'data-column'].includes(attributeName)) {
        return this.isKanbanRelatedElement(target);
      }
      
      // style属性の変更（ドラッグ中の要素の位置変更など）
      if (attributeName === 'style' && this.isKanbanRelatedElement(target)) {
        return true;
      }
    }
    
    // 子要素の追加・削除（カードの移動や新規作成）
    if (mutation.type === 'childList') {
      // 列コンテナレベルでの変更を優先監視
      if (this.isKanbanColumnElement(target)) {
        console.log('[Backlog] Column-level childList change detected:', target);
        return true;
      }
      
      // 追加された要素をチェック
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && this.isKanbanCardElement(node)) {
          console.log('[Backlog] Card added to DOM:', node);
          return true;
        }
      }
      
      // 削除された要素をチェック
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && this.isKanbanCardElement(node)) {
          console.log('[Backlog] Card removed from DOM:', node);
          return true;
        }
      }
      
      // カンバン関連コンテナ内での変更
      if (this.isKanbanRelatedElement(target)) {
        return true;
      }
    }
    
    return false;
  }

  isKanbanCardElement(element) {
    if (!element || element.nodeType !== 1) return false;
    
    // React Beautiful DnD draggable属性での判定（最優先）
    if (element.hasAttribute('data-react-beautiful-dnd-draggable')) {
      return true;
    }
    
    // Backlog特有のカードクラス判定
    const className = element.className || '';
    if (typeof className === 'string') {
      // 実際のBacklogで使用される「card」クラス
      if (className.includes('card') && !className.includes('card-copy') && !className.includes('card-user')) {
        return true;
      }
      
      // CSS-in-JSクラスでカード要素の特定
      if (className.includes('css-') && className.includes('box') && 
          element.querySelector('a[href*="/view/"]')) {
        return true;
      }
    }
    
    // 課題リンクを持つ要素での判定
    if (element.querySelector('a.card-label[href*="/view/"]') ||
        element.querySelector('a[href*="/view/"][target="_blank"]')) {
      return true;
    }
    
    // data属性での判定（フォールバック）
    if (element.hasAttribute('data-issue-key') ||
        element.hasAttribute('data-rbd-draggable-id')) {
      return true;
    }
    
    return false;
  }

  isKanbanColumnElement(element) {
    if (!element || element.nodeType !== 1) return false;
    
    // data-statusid属性を持つ要素（列のコンテナ）
    if (element.hasAttribute('data-statusid')) {
      return true;
    }
    
    // React Beautiful DnD droppable属性（ドロップ可能な領域）
    if (element.hasAttribute('data-react-beautiful-dnd-droppable')) {
      return true;
    }
    
    // カンバン列のsection要素
    if (element.tagName === 'SECTION' && 
        (element.querySelector('.SlotHead') || element.querySelector('[data-statusid]'))) {
      return true;
    }
    
    // 列コンテナのクラス名での判定
    const className = element.className || '';
    if (typeof className === 'string') {
      if (className.includes('SlotBox') || 
          className.includes('column') ||
          (className.includes('css-') && element.querySelector('[data-statusid]'))) {
        return true;
      }
    }
    
    return false;
  }

  isKanbanRelatedElement(element) {
    const className = element.className || '';
    if (typeof className === 'string') {
      // 実際のBacklogにおけるカンバン関連クラス
      if (className.includes('kanban') ||
          className.includes('board') ||
          className.includes('column') ||
          className.includes('lane') ||
          className.includes('SlotBox') ||
          className.includes('SlotHead') ||
          className.includes('card')) {
        return true;
      }
    }
    
    // data属性での判定
    if (element.hasAttribute('data-react-beautiful-dnd-droppable') ||
        element.hasAttribute('data-statusid') ||
        element.hasAttribute('data-react-beautiful-dnd-draggable')) {
      return true;
    }
    
    // カンバン列のsection要素
    if (element.tagName === 'SECTION' && 
        (element.querySelector('.SlotHead') || element.querySelector('[data-statusid]'))) {
      return true;
    }
    
    return false;
  }

  processMutationsInBatch(mutations) {
    if (this.immediateMode) {
      // 即座検知モード: バッチ処理をスキップして即座に処理
      console.log('[Backlog] Immediate mode: processing mutations instantly');
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
      const element = mutation.target;
      
      // 列コンテナの変更の場合、その列内の全タスクをチェック
      if (this.isKanbanColumnElement(element) && !processedColumns.has(element)) {
        processedColumns.add(element);
        console.log('[Backlog] Scanning all tasks in column due to childList change');
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
      const element = mutation.target;
      
      // 列コンテナの変更の場合、その列内の全タスクをチェック
      if (this.isKanbanColumnElement(element) && !processedColumns.has(element)) {
        processedColumns.add(element);
        console.log('[Backlog] Scanning all tasks in column due to childList change (batch)');
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
    const taskElements = columnElement.querySelectorAll('*[data-react-beautiful-dnd-draggable], *[class*="card"], *[data-issue-key]');
    
    console.log(`[Backlog] Found ${taskElements.length} task elements in column for ${detectionSource} scan`);
    
    taskElements.forEach(taskElement => {
      if (this.isKanbanCardElement(taskElement)) {
        this.checkElementStatusChangeWithDebounce(taskElement, detectionSource);
      }
    });
    
    // 列内にタスクがない場合でも、削除されたタスクがないかチェック
    if (taskElements.length === 0) {
      console.log('[Backlog] Empty column detected, checking for removed tasks');
      this.checkForRemovedTasks(columnElement);
    }
  }

  checkForRemovedTasks(columnElement) {
    // 現在のタスク状態と実際のDOM要素を比較し、削除されたタスクを検出
    const currentTaskIds = new Set();
    const allCurrentTasks = document.querySelectorAll('*[data-react-beautiful-dnd-draggable], *[class*="card"], *[data-issue-key]');
    
    allCurrentTasks.forEach(taskElement => {
      const task = this.extractTaskFromElement(taskElement);
      if (task) {
        currentTaskIds.add(task.id);
      }
    });
    
    // 記録されているタスクIDのうち、現在DOM上に存在しないものを検出
    const removedTasks = [];
    for (const [taskId, status] of this.taskStates.entries()) {
      if (!currentTaskIds.has(taskId)) {
        removedTasks.push({ taskId, status });
      }
    }
    
    if (removedTasks.length > 0) {
      console.log('[Backlog] Detected removed tasks:', removedTasks);
      // 削除されたタスクの状態をクリア
      removedTasks.forEach(({ taskId }) => {
        this.taskStates.delete(taskId);
        this.changeTimestamps.delete(taskId);
      });
    }
  }

  checkElementStatusChange(element) {
    // 後方互換性のため、デバウンス機能付きの関数を呼び出し
    this.checkElementStatusChangeWithDebounce(element, 'legacy');
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
        console.log(`[Backlog] Debounced duplicate change for ${task.issueKey} (${detectionSource})`);
        return;
      }
      
      const oldStatus = this.taskStates.get(task.id);
      
      if (oldStatus && oldStatus !== task.status) {
        this.changeTimestamps.set(task.id, now);
        
        const changeInfo = {
          taskId: task.id,
          oldStatus: oldStatus,
          newStatus: task.status,
          taskTitle: task.title,
          issueKey: task.issueKey,
          spaceId: task.spaceId,
          detectionMethod: 'mutation',
          detectionSource: detectionSource,
          timestamp: now
        };
        
        console.log(`[Backlog] Status change detected (${detectionSource}):`, 
                    `${task.issueKey}: ${oldStatus} → ${task.status} at ${new Date(now).toLocaleTimeString()}`);
        
        this.notifyStatusChange(changeInfo);
      }
      
      this.taskStates.set(task.id, task.status);
    });
  }

  getElementsToCheck(element) {
    const elementsToCheck = [element];
    
    // 親要素もチェック（最大3レベル上まで）
    let parent = element.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      if (this.isKanbanCardElement(parent) || this.isKanbanRelatedElement(parent)) {
        elementsToCheck.push(parent);
      }
      parent = parent.parentElement;
    }
    
    // 子要素もチェック（カード要素を含む子要素）
    const childCards = element.querySelectorAll('*[data-react-beautiful-dnd-draggable], *[class*="card"], *[data-issue-key]');
    childCards.forEach(child => {
      if (this.isKanbanCardElement(child)) {
        elementsToCheck.push(child);
      }
    });
    
    // 兄弟要素もチェック（列内の他のタスク）
    if (this.isKanbanColumnElement(element.parentElement)) {
      const siblingCards = element.parentElement.querySelectorAll('*[data-react-beautiful-dnd-draggable], *[class*="card"], *[data-issue-key]');
      siblingCards.forEach(sibling => {
        if (this.isKanbanCardElement(sibling) && sibling !== element) {
          elementsToCheck.push(sibling);
        }
      });
    }
    
    // 重複を除去
    return [...new Set(elementsToCheck)];
  }

  // ==========================================
  // 2. ポインター監視
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
        console.log('[Backlog] Pointer down on task:', task.issueKey, task.status, '(immediate mode activated)');
      }
    }
  }

  handlePointerUp(e) {
    if (this.pointerStartTask) {
      this.detectionStats.pointer++;
      console.log('[Backlog] Pointer up, checking for status change:', this.pointerStartTask.issueKey);
      
      setTimeout(() => {
        this.processPointerDragCompletion();
      }, 150);
      
      // 即座検知モードを少し遅延させて無効化（Mutation検知との協調のため）
      setTimeout(() => {
        this.immediateMode = false;
        console.log('[Backlog] Immediate mode deactivated');
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
          console.log(`[Backlog] Debounced pointer change for ${currentTask.issueKey}`);
          return;
        }
        
        this.changeTimestamps.set(currentTask.id, now);
        
        const changeInfo = {
          taskId: originalTask.id,
          oldStatus: originalTask.status,
          newStatus: currentTask.status,
          taskTitle: currentTask.title,
          issueKey: currentTask.issueKey,
          spaceId: currentTask.spaceId,
          detectionMethod: 'pointer',
          detectionSource: 'drag-drop',
          timestamp: now
        };
        
        console.log(`[Backlog] Status change detected (pointer):`, 
                    `${currentTask.issueKey}: ${originalTask.status} → ${currentTask.status} at ${new Date(now).toLocaleTimeString()}`);
        
        this.notifyStatusChange(changeInfo);
        this.taskStates.set(originalTask.id, currentTask.status);
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
      
      if (this.isKanbanCardElement(current)) {
        return current;
      }
      
      current = current.parentElement;
    }
    
    return null;
  }

  isDraggable(element) {
    return element.getAttribute('draggable') === 'true' ||
           element.hasAttribute('data-react-beautiful-dnd-draggable') ||
           element.hasAttribute('data-react-beautiful-dnd-drag-handle') ||
           element.hasAttribute('data-rbd-drag-handle-draggable-id');
  }

  findTaskElementById(taskId, issueKey) {
    if (issueKey) {
      const byIssueKey = document.querySelector(`[data-issue-key="${issueKey}"]`);
      if (byIssueKey) return byIssueKey;
    }
    
    const elements = document.querySelectorAll('*[draggable="true"], *[data-issue-key], *[class*="card"]');
    
    for (const element of elements) {
      const task = this.extractTaskFromElement(element);
      if (task && (task.id === taskId || task.issueKey === issueKey)) {
        return element;
      }
    }
    
    return null;
  }

  extractTaskFromElement(element) {
    if (!element) return null;
    
    try {
      // 課題キーの抽出（実際のBacklog HTML構造に基づく）
      let issueKey = null;
      
      // 1. card-labelリンクから抽出
      const cardLabel = element.querySelector('a.card-label[href*="/view/"]');
      if (cardLabel) {
        const href = cardLabel.getAttribute('href');
        const match = href.match(/\/view\/([A-Z]+-\d+)/);
        if (match) {
          issueKey = match[1];
        }
      }
      
      // 2. 一般的な課題リンクから抽出
      if (!issueKey) {
        const issueLink = element.querySelector('a[href*="/view/"][target="_blank"]');
        if (issueLink) {
          const href = issueLink.getAttribute('href');
          const match = href.match(/\/view\/([A-Z]+-\d+)/);
          if (match) {
            issueKey = match[1];
          }
        }
      }
      
      // 3. data属性から抽出（フォールバック）
      if (!issueKey) {
        issueKey = element.getAttribute('data-issue-key') ||
                  element.getAttribute('data-issue') ||
                  element.getAttribute('data-rbd-draggable-id');
      }
      
      // 4. テキストコンテンツから抽出（最後の手段）
      if (!issueKey) {
        const text = element.textContent || '';
        const match = text.match(/([A-Z]+-\d+)/);
        if (match) {
          issueKey = match[1];
        }
      }
      
      if (!issueKey) return null;
      
      // タイトルの抽出（実際のBacklog HTML構造に基づく）
      let title = 'Unknown Task';
      
      // 1. card-summaryクラスから抽出
      const cardSummary = element.querySelector('.card-summary');
      if (cardSummary) {
        title = cardSummary.textContent?.trim() || 'Unknown Task';
      }
      
      // 2. 課題リンクのテキストから抽出
      if (title === 'Unknown Task' && cardLabel) {
        title = cardLabel.textContent?.trim() || 'Unknown Task';
      }
      
      // 3. 一般的な抽出方法（フォールバック）
      if (title === 'Unknown Task') {
        title = element.getAttribute('title') ||
               element.getAttribute('aria-label') ||
               'Unknown Task';
      }
      
      // 4. テキストコンテンツから抽出（最後の手段）
      if (title === 'Unknown Task') {
        const textContent = element.textContent?.trim() || '';
        if (issueKey && textContent.includes(issueKey)) {
          title = textContent.replace(issueKey, '').replace(/\s+/g, ' ').trim();
        } else {
          const lines = textContent.split('\n').filter(line => line.trim());
          title = lines.find(line => !line.match(/^[A-Z]+-\d+$/))?.trim() || 'Unknown Task';
        }
      }
      
      // ステータスの判定
      const status = this.determineTaskStatus(element);
      
      const taskId = `backlog-${issueKey}`;
      
      return {
        id: taskId,
        issueKey: issueKey,
        title: title.substring(0, 100),
        status: status,
        element: element,
        spaceId: this.getSpaceId(),
        timestamp: Date.now()
      };
      
    } catch (error) {
      return null;
    }
  }

  determineTaskStatus(element) {
    // 実際のBacklog HTML構造に基づく動的ステータス判定
    
    // 1. 最も確実な方法：親のsection要素の列ヘッダーから取得
    const sectionElement = element.closest('section');
    if (sectionElement) {
      const statusSelectors = [
        '.SlotHead > div:nth-child(2) > span',
        '.SlotHead div:not(.expand) span:not(.StatusIcon)',
        '.SlotHead span:not(.StatusIcon):not(.foldingIcon):not(.CardLength)',
        '.SlotHead span',
        'h3 span:not(.StatusIcon)'
      ];
      
      for (const selector of statusSelectors) {
        const spans = sectionElement.querySelectorAll(selector);
        for (const span of spans) {
          const statusText = span.textContent?.trim();
          if (statusText && this.isValidStatus(statusText)) {
            return this.normalizeStatus(statusText);
          }
        }
      }
    }
    
    // 2. data-statusid属性を持つ親要素を探してその列のヘッダーから取得
    const statusContainer = element.closest('[data-statusid]');
    if (statusContainer) {
      const statusId = statusContainer.getAttribute('data-statusid');
      const columnHeaders = document.querySelectorAll('section .SlotHead');
      for (const header of columnHeaders) {
        const section = header.closest('section');
        const list = section?.querySelector(`[data-statusid="${statusId}"]`);
        if (list) {
          const statusSelectors = [
            '.SlotHead > div:nth-child(2) > span',
            '.SlotHead div:not(.expand) span:not(.StatusIcon)',
            '.SlotHead span:not(.StatusIcon):not(.foldingIcon):not(.CardLength)',
            '.SlotHead span'
          ];
          
          for (const selector of statusSelectors) {
            const statusSpan = header.querySelector(selector);
            if (statusSpan) {
              const statusText = statusSpan.textContent?.trim();
              if (statusText && this.isValidStatus(statusText)) {
                return this.normalizeStatus(statusText);
              }
            }
          }
        }
      }
    }
    
    // 3. data属性から直接取得（ハードコードマッピングは使用しない）
    let current = element;
    for (let i = 0; i < 5; i++) {
      if (!current) break;
      
      const dataStatus = current.getAttribute('data-status') ||
                        current.getAttribute('data-column');
      
      if (dataStatus && this.isValidStatus(dataStatus)) {
        return this.normalizeStatus(dataStatus);
      }
      
      current = current.parentElement;
    }
    
    // 4. 位置ベースの判定（フォールバック）
    return this.getStatusFromPosition(element);
  }

  getStatusFromPosition(element) {
    try {
      const rect = element.getBoundingClientRect();
      
      const columnHeaders = document.querySelectorAll([
        'section .SlotHead',
        'section h3',
        '.kanban-column-header',
        '.column-header',
        '*[class*="column"] h1',
        '*[class*="column"] h2',
        '*[class*="column"] h3'
      ].join(', '));
      
      let bestMatch = null;
      let bestDistance = Infinity;
      
      for (const header of columnHeaders) {
        const headerRect = header.getBoundingClientRect();
        
        // 水平方向で重複確認（より柔軟な判定）
        const horizontalCenter = (rect.left + rect.right) / 2;
        const headerHorizontalOverlap = headerRect.left <= rect.right && headerRect.right >= rect.left;
        const horizontalCenterWithinHeader = horizontalCenter >= headerRect.left && horizontalCenter <= headerRect.right;
        const horizontalMatch = headerHorizontalOverlap || horizontalCenterWithinHeader;
        
        // 垂直方向の位置関係（より寛容な判定）
        const verticallyRelevant = headerRect.top <= rect.bottom && headerRect.bottom >= rect.top - 500; // より広い範囲
        
        if (horizontalMatch && verticallyRelevant) {
          let distance;
          if (headerRect.bottom <= rect.top) {
            distance = rect.top - headerRect.bottom;
          } else if (headerRect.top >= rect.bottom) {
            distance = headerRect.top - rect.bottom + 1000;
          } else {
            distance = 0;
          }
          
          if (distance < bestDistance) {
            // 実際のHTML構造に基づく精密なステータステキスト取得
            const statusSelectors = [
              '.SlotHead > div:nth-child(2) > span',
              '.SlotHead div:not(.expand) span:not(.StatusIcon)',
              '.SlotHead span:not(.StatusIcon):not(.foldingIcon):not(.CardLength)',
              '.SlotHead span',
              'span:not(.StatusIcon):not(.expand):not(.CardLength)'
            ];
            
            let headerText = null;
            
            for (const selector of statusSelectors) {
              const statusSpan = header.querySelector(selector);
              if (statusSpan) {
                headerText = statusSpan.textContent?.trim();
                if (headerText && this.isValidStatus(headerText)) {
                  break;
                }
              }
            }
            
            // フォールバック: ヘッダー全体のテキスト
            if (!headerText || !this.isValidStatus(headerText)) {
              headerText = header.textContent?.trim();
              // ステータステキストのみを抽出（数字を含む）
              const statusMatch = headerText?.match(/(未対応|処理中|処理済み|完了|レビュー|todo|doing|done|review|progress|complete|open|closed|new|finished)[\d\s]*/i);
              if (statusMatch) {
                headerText = statusMatch[1];
              }
            }
            
            if (headerText && this.isValidStatus(headerText)) {
              bestMatch = headerText;
              bestDistance = distance;
            }
          }
        }
      }
      
      if (bestMatch) {
        return this.normalizeStatus(bestMatch);
      }
      
      return 'Unknown';
      
    } catch (error) {
      return 'Unknown';
    }
  }

  isValidStatus(text) {
    if (!text) return false;
    
    const statusKeywords = [
      '未対応', '新規', 'todo', 'open', 'new', 'backlog',
      '処理中', '進行中', 'progress', 'doing', 'in progress', '対応中',
      '処理済み', '処理済', 'processed', 'resolved',
      '完了', '終了', 'done', 'complete', 'finished', 'closed',
      'レビュー', 'review', 'testing', 'テスト', '確認'
    ];
    
    const lowerText = text.toLowerCase();
    return statusKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  normalizeStatus(rawStatus) {
    if (!rawStatus) return 'Unknown';
    
    const status = rawStatus.toString().toLowerCase();
    
    // 数字とマークを除去
    const cleaned = rawStatus.replace(/[\d\(\)\[\]]/g, '').trim();
    
    // 処理済みの判定を処理中より前に
    if (status.includes('処理済') || status.includes('processed') || status.includes('resolved')) {
      return '処理済み';
    }
    if (status.includes('処理中') || status.includes('progress') || status.includes('doing') || status.includes('対応中')) {
      return '処理中';
    }
    if (status.includes('完了') || status.includes('done') || status.includes('complete') || status.includes('finished')) {
      return '完了';
    }
    if (status.includes('未対応') || status.includes('todo') || status.includes('open') || status.includes('new') || status.includes('backlog')) {
      return '未対応';
    }
    if (status.includes('review') || status.includes('レビュー') || status.includes('確認')) {
      return 'レビュー';
    }
    
    return cleaned || 'Unknown';
  }

  // ==========================================
  // ヘルパーメソッド
  // ==========================================
  
  getStatusNameById(statusId) {
    // 一般的なBacklogステータスID マッピング
    const statusMap = {
      '1': '未対応',
      '2': '処理中',
      '3': '処理済み',
      '4': '完了'
    };
    
    return statusMap[statusId.toString()] || 'Unknown';
  }

  getTaskTitleByKey(issueKey) {
    const element = document.querySelector(`[data-issue-key="${issueKey}"]`);
    if (element) {
      const task = this.extractTaskFromElement(element);
      return task ? task.title : 'Unknown Task';
    }
    return 'Unknown Task';
  }

  getSpaceId() {
    const urlMatch = window.location.href.match(/https?:\/\/([^.]+)\.backlog\.(com|jp)/);
    return urlMatch ? urlMatch[1] : 'unknown-space';
  }

  getProjectName() {
    const urlMatch = window.location.href.match(/\/board\/([^\/\?]+)/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
  }


  // ==========================================
  // 初期化とステータス変更通知
  // ==========================================
  
  async initializeTaskStates() {
    const initializeWhenReady = () => {
      try {
        const selectors = [
          '*[data-issue-key]',
          '*[draggable="true"]', 
          '*[class*="card"]',
          '*[data-react-beautiful-dnd-draggable]'
        ];
        
        let allTaskElements = [];
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          allTaskElements.push(...Array.from(elements));
        });
        
        const uniqueElements = [...new Set(allTaskElements)];
        
        uniqueElements.forEach((element) => {
          const task = this.extractTaskFromElement(element);
          if (task) {
            this.taskStates.set(task.id, task.status);
            this.notifyTaskInitialized(task);
          }
        });
        
      } catch (error) {
        console.log('[Backlog] Error initializing task states:', error);
      }
    };
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeWhenReady);
    } else {
      setTimeout(initializeWhenReady, 1000);
    }
  }

  notifyTaskInitialized(task) {
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_INITIALIZED',
        data: {
          taskId: task.id,
          status: task.status,
          service: 'backlog',
          taskTitle: task.title,
          projectName: this.getProjectName(),
          issueKey: task.issueKey,
          spaceId: task.spaceId
        }
      });
    } catch (error) {
      console.error('[Backlog] Extension context invalidated, unable to send task initialization:', error);
    }
  }

  notifyStatusChange(changeInfo) {
    console.log(`[Backlog] ${changeInfo.issueKey}: ${changeInfo.oldStatus} → ${changeInfo.newStatus} (${changeInfo.detectionMethod})`);
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: {
          taskId: changeInfo.taskId,
          newStatus: changeInfo.newStatus,
          oldStatus: changeInfo.oldStatus,
          service: 'backlog',
          taskTitle: changeInfo.taskTitle,
          projectName: this.getProjectName(),
          issueKey: changeInfo.issueKey,
          spaceId: changeInfo.spaceId,
          detectionMethod: changeInfo.detectionMethod
        }
      });
    } catch (error) {
      console.error('[Backlog] Extension context invalidated, unable to send status change:', error);
    }
  }

  // ==========================================
  // デバッグ用機能
  // ==========================================
  
  getDetectionStats() {
    return {
      ...this.detectionStats,
      taskStates: this.taskStates.size,
      totalDetections: Object.values(this.detectionStats).reduce((a, b) => a + b, 0),
      immediateMode: this.immediateMode,
      pendingChanges: this.pendingChanges.size,
      recentChanges: Array.from(this.changeTimestamps.entries()).map(([taskId, timestamp]) => ({
        taskId,
        timestamp,
        timeAgo: Date.now() - timestamp
      })).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10)
    };
  }

  debugCurrentState() {
    console.group('🔍 Backlog V8 Debug Information');
    console.log('Detection Stats:', this.getDetectionStats());
    console.log('Task States:', Array.from(this.taskStates.entries()));
    console.log('Detection Methods Status:', this.detectionMethods);
    console.log('Recent Status Changes:', Array.from(this.changeTimestamps.entries()).map(([taskId, timestamp]) => ({
      taskId,
      lastChange: new Date(timestamp).toLocaleTimeString(),
      timeAgo: `${Math.round((Date.now() - timestamp) / 1000)}s ago`
    })));
    console.log('Immediate Mode:', this.immediateMode);
    console.log('Debounce Delay:', this.debounceDelay + 'ms');
    console.groupEnd();
  }

  forceTaskScan() {
    this.taskStates.clear();
    this.initializeTaskStates();
  }

  toggleDetectionMethod(method, enabled) {
    if (this.detectionMethods.hasOwnProperty(method)) {
      this.detectionMethods[method] = enabled;
    }
  }
}

// 初期化
if (window.location.href.includes('.backlog.')) {
  window.backlogTrackerV8 = new BacklogTaskTrackerV8();
  
  // 互換性のため
  window.backlogTrackerV7 = window.backlogTrackerV8;
  window.backlogTrackerV6 = window.backlogTrackerV8;
  window.backlogTrackerV5 = window.backlogTrackerV8;
  window.backlogTrackerV4 = window.backlogTrackerV8;
  
  console.log('🚀 Backlog Task Tracker V8 loaded successfully!');
}

// デバッグ用グローバル関数
window.debugBacklogTracker = () => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.debugCurrentState();
  }
};

window.forceBacklogScan = () => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.forceTaskScan();
  }
};

window.getBacklogStats = () => {
  if (window.backlogTrackerV8) {
    return window.backlogTrackerV8.getDetectionStats();
  }
  return null;
};

window.toggleBacklogDetection = (method, enabled) => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.toggleDetectionMethod(method, enabled);
  }
};

window.toggleBacklogImmediateMode = (enabled) => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.immediateMode = enabled;
    console.log(`[Backlog] Immediate mode ${enabled ? 'enabled' : 'disabled'}`);
  }
};

window.setBacklogDebounceDelay = (delayMs) => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.debounceDelay = delayMs;
    console.log(`[Backlog] Debounce delay set to ${delayMs}ms`);
  }
};

window.clearBacklogChangeHistory = () => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.changeTimestamps.clear();
    window.backlogTrackerV8.pendingChanges.clear();
    console.log('[Backlog] Change history cleared');
  }
};