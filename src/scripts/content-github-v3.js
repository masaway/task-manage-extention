class GitHubTaskTrackerV3 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.draggedCardInfo = null;
    this.lastKnownStatus = new Map();
    
    // Backlog方式の検知システム
    this.detectionStats = {
      mutation: 0,
      pointer: 0
    };

    // 即座検知とデバウンス用の状態管理
    this.immediateMode = false;
    this.pendingChanges = new Map(); // taskId -> {timestamp, changeInfo}
    this.changeTimestamps = new Map(); // taskId -> timestamp
    this.debounceDelay = 100; // 100ms内の重複変更を防ぐ
    
    // GitHub SPA のネットワークリクエストを監視
    this.originalFetch = window.fetch;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    
    // メイン機能を先に初期化
    this.init();
    
    // バナー通知システムを後で初期化
    this.setupBannerNotification();
    this.setupBackgroundMessageListener();
  }

  setupBannerNotification() {
    // DOM readyを保証してからバナー通知システムを初期化
    this.ensureDOMReady().then(() => {
      if (!window.taskTrackerBanner) {
        this.initializeBannerNotification();
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
    // バナー通知システムを直接初期化（BacklogTaskTrackerV8と同じ実装）
    class BannerNotification {
      constructor() {
        this.currentBanner = null;
        this.bannerQueue = [];
        this.isShowing = false;
        this.setupStyles();
      }

      setupStyles() {
        if (document.getElementById('task-tracker-banner-styles')) return;
        
        // CSPに配慮してlinkタグでCSSファイルを読み込む
        const linkElement = document.createElement('link');
        linkElement.id = 'task-tracker-banner-styles';
        linkElement.rel = 'stylesheet';
        linkElement.type = 'text/css';
        linkElement.href = chrome.runtime.getURL('src/styles/banner-notification.css');
        document.head.appendChild(linkElement);
        
        // フォールバック: CSSファイルが読み込めない場合はインラインで設定
        linkElement.onerror = () => {
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
            opacity: 0;
            transform: translateY(-20px);
            transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            overflow: hidden;
          }

          .task-tracker-banner.show {
            opacity: 1;
            transform: translateY(0);
          }

          .task-tracker-banner.hide {
            opacity: 0;
            transform: translateY(-20px);
          }

          .task-tracker-banner-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px 8px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
          }

          .task-tracker-banner-title {
            font-weight: 600;
            font-size: 15px;
            margin: 0;
          }

          .task-tracker-banner-close {
            background: none;
            border: none;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s ease;
            font-size: 14px;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
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

          @keyframes bannerSlideIn {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes bannerSlideOut {
            from {
              opacity: 1;
              transform: translateY(0);
            }
            to {
              opacity: 0;
              transform: translateY(-20px);
            }
          }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'task-tracker-banner-inline-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
      }

      show(data) {
        if (this.isShowing && this.currentBanner) {
          this.bannerQueue.push(data);
          return;
        }

        this.isShowing = true;
        const { type, taskTitle, duration, projectName } = data;

        const banner = document.createElement('div');
        banner.className = `task-tracker-banner ${type}`;

        let title, content;
        if (type === 'start') {
          title = 'タスク計測開始';
          content = `
            <div class="task-tracker-banner-task-title">${taskTitle}</div>
            <div class="task-tracker-banner-details">${projectName ? `プロジェクト: ${projectName}` : ''}</div>
          `;
        } else {
          title = 'タスク計測終了';
          const durationText = duration ? this.formatDuration(duration) : '';
          content = `
            <div class="task-tracker-banner-task-title">${taskTitle}</div>
            <div class="task-tracker-banner-details">
              ${projectName ? `プロジェクト: ${projectName}` : ''}
              ${durationText ? `<div class="task-tracker-banner-duration">作業時間: ${durationText}</div>` : ''}
            </div>
          `;
        }

        banner.innerHTML = `
          <div class="task-tracker-banner-header">
            <h4 class="task-tracker-banner-title">${title}</h4>
            <button class="task-tracker-banner-close" aria-label="Close">×</button>
          </div>
          <div class="task-tracker-banner-content">
            ${content}
          </div>
          <div class="task-tracker-banner-progress"></div>
        `;

        banner.querySelector('.task-tracker-banner-close').addEventListener('click', () => {
          this.hide(true);
        });

        let hideTimeout = null;
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

      showNext() {
        this.isShowing = false;
        if (this.bannerQueue.length > 0) {
          const nextData = this.bannerQueue.shift();
          this.show(nextData);
        }
      }
    }

    window.taskTrackerBanner = new BannerNotification();
  }

  setupBackgroundMessageListener() {
    // バナー通知専用のメッセージリスナーを追加
    if (!window.githubBannerListenerAdded) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SHOW_BANNER_NOTIFICATION') {
          // GitHubサービスの通知のみ処理
          if (message.data && message.data.service === 'github') {
            console.log('[GitHubTracker] Processing banner notification for GitHub service');
            this.handleBannerNotification(message.data);
            sendResponse({ success: true, processed: true });
          } else {
            console.log('[GitHubTracker] Ignoring non-GitHub banner notification');
            sendResponse({ success: false, processed: false });
          }
          return true; // 非同期レスポンスを示す
        }
      });
      window.githubBannerListenerAdded = true;
    }
  }

  async handleBannerNotification(data) {
    const { type, taskTitle, duration, projectName } = data;
    
    if (window.taskTrackerBanner) {
      try {
        if (type === 'start') {
          await window.taskTrackerBanner.showTaskStart(taskTitle, projectName);
        } else if (type === 'stop') {
          await window.taskTrackerBanner.showTaskStop(taskTitle, duration, projectName);
        }
      } catch (error) {
        console.error('[GitHubTracker] Error showing banner notification:', error);
      }
    } else {
      this.initializeBannerNotification();
      // Retry after initialization
      setTimeout(() => {
        if (window.taskTrackerBanner) {
          this.handleBannerNotification(data);
        }
      }, 100);
    }
  }

  init() {
    console.log('[GitHub] Initializing GitHub Projects tracker');
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
          console.log('[GitHub] GitHub Projects board elements detected');
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
    console.log('[GitHub] Setting up MutationObserver');
    
    this.observer = new MutationObserver((mutations) => {
      this.processMutationsInBatch(mutations);
    });
    
    // document.bodyが存在するまで待機
    const startObserver = () => {
      if (document.body) {
        console.log('[GitHub] Starting MutationObserver on document.body');
        this.observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-board-column', 'class']
        });
      } else {
        console.log('[GitHub] document.body not ready, retrying...');
        setTimeout(startObserver, 100);
      }
    };
    
    startObserver();
  }

  shouldProcessMutation(mutation) {
    const target = mutation.target;
    
    // data-board-column属性の変更（GitHub特有）
    if (mutation.type === 'attributes' && mutation.attributeName === 'data-board-column') {
      console.log('[GitHub] Board column attribute change detected:', target);
      return true;
    }
    
    // class属性の変更
    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
      if (this.isGitHubCardElement(target) || this.isGitHubColumnElement(target)) {
        console.log('[GitHub] Class change on card/column element:', target);
        return true;
      }
    }
    
    // 子要素の追加・削除（カードの移動や新規作成）
    if (mutation.type === 'childList') {
      // 列コンテナレベルでの変更を優先監視
      if (this.isGitHubColumnElement(target)) {
        console.log('[GitHub] Column-level childList change detected:', target);
        return true;
      }
      
      // 追加された要素をチェック
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && this.isGitHubCardElement(node)) {
          console.log('[GitHub] Card added to DOM:', node);
          return true;
        }
      }
      
      // 削除された要素をチェック
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && this.isGitHubCardElement(node)) {
          console.log('[GitHub] Card removed from DOM:', node);
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
    if (this.immediateMode) {
      // 即座検知モード: バッチ処理をスキップして即座に処理
      console.log('[GitHub] Immediate mode: processing mutations instantly');
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
        console.log('[GitHub] Scanning all tasks in column due to childList change');
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
        console.log('[GitHub] Scanning all tasks in column due to childList change (batch)');
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
    
    console.log(`[GitHub] Found ${taskElements.length} task elements in column for ${detectionSource} scan`);
    
    taskElements.forEach(taskElement => {
      if (this.isGitHubCardElement(taskElement)) {
        this.checkElementStatusChangeWithDebounce(taskElement, detectionSource);
      }
    });
    
    // 列内にタスクがない場合でも、削除されたタスクがないかチェック
    if (taskElements.length === 0) {
      console.log('[GitHub] Empty column detected, checking for removed tasks');
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
      console.log('[GitHub] Detected removed tasks:', removedTasks);
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
        console.log(`[GitHub] Debounced duplicate change for ${task.issueKey} (${detectionSource})`);
        return;
      }
      
      const oldStatus = this.lastKnownStatus.get(task.id);
      
      if (oldStatus && oldStatus !== task.status) {
        this.changeTimestamps.set(task.id, now);
        
        const changeInfo = {
          taskId: task.id,
          oldStatus: oldStatus,
          newStatus: task.status,
          taskTitle: task.title,
          issueKey: task.issueKey,
          projectName: task.projectName,
          detectionMethod: 'mutation',
          detectionSource: detectionSource,
          timestamp: now
        };
        
        console.log(`[GitHub] Status change detected (${detectionSource}):`, 
                    `${task.issueKey}: ${oldStatus} → ${task.status} at ${new Date(now).toLocaleTimeString()}`);
        
        this.notifyStatusChange(changeInfo);
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
    const titleElement = element.querySelector('.title-module__SanitizedHtml_1--dvKYp');
    
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
    console.log('[GitHub] Initializing task states');
    
    const cardElements = document.querySelectorAll('[data-board-card-id]');
    console.log(`[GitHub] Found ${cardElements.length} task cards`);
    
    cardElements.forEach(cardElement => {
      const task = this.extractTaskFromElement(cardElement);
      if (task) {
        this.lastKnownStatus.set(task.id, task.status);
        console.log(`[GitHub] Initialized task: ${task.title} -> ${task.status}`);
        
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
    console.log('[GitHub] Setting up pointer monitoring');
    
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
        console.log('[GitHub] Pointer down on task:', task.issueKey, task.status, '(immediate mode activated)');
      }
    }
  }

  handlePointerUp(e) {
    if (this.pointerStartTask) {
      console.log('[GitHub] Pointer up, checking for status change:', this.pointerStartTask.issueKey);
      
      setTimeout(() => {
        this.processPointerDragCompletion();
      }, 150);
      
      // 即座検知モードを少し遅延させて無効化（Mutation検知との協調のため）
      setTimeout(() => {
        this.immediateMode = false;
        console.log('[GitHub] Immediate mode deactivated');
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
          console.log(`[GitHub] Debounced pointer change for ${currentTask.issueKey}`);
          return;
        }
        
        this.changeTimestamps.set(currentTask.id, now);
        
        const changeInfo = {
          taskId: originalTask.id,
          oldStatus: originalTask.status,
          newStatus: currentTask.status,
          taskTitle: currentTask.title,
          issueKey: currentTask.issueKey,
          projectName: currentTask.projectName,
          detectionMethod: 'pointer',
          detectionSource: 'drag-drop',
          timestamp: now
        };
        
        console.log(`[GitHub] Status change detected (pointer):`, 
                    `${currentTask.issueKey}: ${originalTask.status} → ${currentTask.status} at ${new Date(now).toLocaleTimeString()}`);
        
        this.notifyStatusChange(changeInfo);
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
    console.log('[GitHub] Sending status change to background:', data);
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: data
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[GitHub] Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('[GitHub] Status change sent successfully:', response);
        }
      });
    } catch (error) {
      console.error('[GitHub] Extension context invalidated, unable to send message:', error);
    }
  }

  sendTaskInitialized(data) {
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
      });
    } catch (error) {
      console.error('[GitHub] Extension context invalidated, unable to send task initialization:', error);
    }
  }
}

// GitHub Projects用のトラッカーを初期化
console.log('[GitHub] Checking URL:', window.location.pathname);
if (window.location.pathname.includes('/projects/')) {
  console.log('[GitHub] Creating GitHub Projects task tracker');
  new GitHubTaskTrackerV3();
} else {
  console.log('[GitHub] Not a GitHub Projects page, skipping initialization');
}