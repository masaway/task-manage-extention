class GitHubTaskTrackerV3 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.draggedCardInfo = null;
    
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
      console.log('[GitHubTracker] DOM ready confirmed, initializing banner notification');
      if (!window.taskTrackerBanner) {
        this.initializeBannerNotification();
      } else {
        console.log('[GitHubTracker] Banner notification already initialized');
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

        console.log('[GitHubTracker] Setting up banner styles');
        
        // CSPに配慮してlinkタグでCSSファイルを読み込む
        const linkElement = document.createElement('link');
        linkElement.id = 'task-tracker-banner-styles';
        linkElement.rel = 'stylesheet';
        linkElement.type = 'text/css';
        linkElement.href = chrome.runtime.getURL('src/styles/banner-notification.css');
        document.head.appendChild(linkElement);
        
        console.log('[GitHubTracker] Banner styles loaded from external CSS');
        
        // フォールバック: CSSファイルが読み込めない場合はインラインで設定
        linkElement.onerror = () => {
          console.log('[GitHubTracker] External CSS failed, falling back to inline styles');
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
    if (!window.githubBannerListenerAdded) {
      console.log('[GitHubTracker] Setting up background message listener');
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[GitHubTracker] Message received:', message.type, message);
        if (message.type === 'SHOW_BANNER_NOTIFICATION') {
          console.log('[GitHubTracker] Processing banner notification:', message.data);
          console.log('[GitHubTracker] Banner object exists:', !!window.taskTrackerBanner);
          this.handleBannerNotification(message.data);
          sendResponse({ success: true });
          return true; // 非同期レスポンスを示す
        } else {
          console.log('[GitHubTracker] Ignoring message type:', message.type);
        }
      });
      window.githubBannerListenerAdded = true;
      console.log('[GitHubTracker] Background message listener setup complete');
    } else {
      console.log('[GitHubTracker] Background message listener already exists');
    }
  }

  async handleBannerNotification(data) {
    console.log('[GitHubTracker] handleBannerNotification called with:', data);
    const { type, taskTitle, duration, projectName } = data;
    
    if (window.taskTrackerBanner) {
      console.log('[GitHubTracker] Banner object available, showing notification');
      try {
        if (type === 'start') {
          console.log('[GitHubTracker] Showing start notification');
          await window.taskTrackerBanner.showTaskStart(taskTitle, projectName);
        } else if (type === 'stop') {
          console.log('[GitHubTracker] Showing stop notification');
          await window.taskTrackerBanner.showTaskStop(taskTitle, duration, projectName);
        } else {
          console.log('[GitHubTracker] Unknown notification type:', type);
        }
        console.log('[GitHubTracker] Banner notification processed successfully');
      } catch (error) {
        console.error('[GitHubTracker] Error showing banner notification:', error);
      }
    } else {
      console.error('[GitHubTracker] Banner object not available, cannot show notification');
      console.log('[GitHubTracker] Attempting to initialize banner now...');
      this.initializeBannerNotification();
      // Retry after initialization
      setTimeout(() => {
        if (window.taskTrackerBanner) {
          console.log('[GitHubTracker] Retrying banner notification after delayed initialization');
          this.handleBannerNotification(data);
        } else {
          console.error('[GitHubTracker] Banner initialization failed completely');
        }
      }, 100);
    }
  }

  init() {
    console.log('[GitHub Tracker V3] Initializing network-based tracking');
    
    // 1. Network interception (最も効率的)
    this.interceptNetworkRequests();
    
    // 2. History API monitoring
    this.interceptHistoryChanges();
    
    // 3. Event delegation (最小限のDOM監視)
    this.setupEventDelegation();
    
    // 4. Storage events (他のタブとの同期)
    this.setupStorageSync();
    
    console.log('[GitHub Tracker V3] Initialization complete');
  }

  // GitHub Projects V2 の GraphQL API を監視
  interceptNetworkRequests() {
    console.log('[GitHub Tracker V3] Setting up network interception');
    
    // Fetch API の監視
    window.fetch = async (...args) => {
      const response = await this.originalFetch.apply(window, args);
      this.analyzeNetworkRequest(args[0], args[1], response.clone());
      return response;
    };

    // XMLHttpRequest の監視
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._url = url;
      this._method = method;
      
      this.addEventListener('load', () => {
        window.gitHubTracker.analyzeXHRResponse(this);
      });
      
      return window.gitHubTracker.originalXHROpen.apply(this, [method, url, ...rest]);
    };
    
    window.gitHubTracker = this;
  }

  async analyzeNetworkRequest(url, options, response) {
    try {
      // GitHub Projects V2 GraphQL API のリクエストを検出
      if (typeof url === 'string' && url.includes('/graphql') && options?.body) {
        const requestBody = options.body;
        
        // ProjectV2 の mutation を検出
        if (requestBody.includes('updateProjectV2ItemFieldValue') || 
            requestBody.includes('moveProjectV2Item')) {
          
          console.log('[GitHub Tracker V3] ProjectV2 mutation detected');
          
          // レスポンスを解析してタスク移動を検出
          const responseData = await response.json();
          this.processGraphQLResponse(responseData);
        }
      }
    } catch (error) {
      // Silent fail - レスポンスが既に消費されている場合など
    }
  }

  analyzeXHRResponse(xhr) {
    if (xhr._url && xhr._url.includes('/graphql') && xhr.responseText) {
      try {
        const response = JSON.parse(xhr.responseText);
        this.processGraphQLResponse(response);
      } catch (error) {
        // Silent fail
      }
    }
  }

  processGraphQLResponse(responseData) {
    console.log('[GitHub Tracker V3] Processing GraphQL response:', responseData);
    
    // GraphQL レスポンスからタスク情報を抽出
    if (responseData.data) {
      // updateProjectV2ItemFieldValue の場合
      if (responseData.data.updateProjectV2ItemFieldValue) {
        const item = responseData.data.updateProjectV2ItemFieldValue.projectV2Item;
        this.handleItemUpdate(item);
      }
      
      // moveProjectV2Item の場合
      if (responseData.data.moveProjectV2Item) {
        const item = responseData.data.moveProjectV2Item.projectV2Item;
        this.handleItemUpdate(item);
      }
    }
  }

  handleItemUpdate(item) {
    if (!item) return;
    
    console.log('[GitHub Tracker V3] Item update detected:', item);
    
    // GraphQL データからタスク情報を構築
    const taskInfo = this.extractTaskInfoFromGraphQL(item);
    if (taskInfo) {
      console.log('[GitHub Tracker V3] Task status change via GraphQL:', taskInfo);
      this.sendStatusChange(taskInfo);
    }
  }

  extractTaskInfoFromGraphQL(item) {
    try {
      // GraphQL レスポンスの構造に基づいてデータを抽出
      const content = item.content;
      const fieldValues = item.fieldValues?.nodes || [];
      
      let status = null;
      let title = null;
      let taskId = null;
      
      // ステータスフィールドを探す
      for (const field of fieldValues) {
        if (field.__typename === 'ProjectV2ItemFieldSingleSelectValue') {
          status = field.name || field.optionId;
        }
      }
      
      // コンテンツ情報を抽出
      if (content) {
        title = content.title || content.name;
        if (content.number) {
          taskId = `github-issue-${content.number}`;
        }
      }
      
      if (title && status) {
        return {
          id: taskId || this.generateTaskId(title),
          title: title,
          status: status,
          projectName: this.getProjectName()
        };
      }
    } catch (error) {
      console.error('[GitHub Tracker V3] Error extracting GraphQL data:', error);
    }
    
    return null;
  }

  // History API の変更を監視（ページ遷移検出）
  interceptHistoryChanges() {
    const tracker = this;
    
    history.pushState = function(...args) {
      tracker.originalPushState.apply(history, args);
      tracker.handleUrlChange();
    };
    
    history.replaceState = function(...args) {
      tracker.originalReplaceState.apply(history, args);
      tracker.handleUrlChange();
    };
    
    window.addEventListener('popstate', () => {
      this.handleUrlChange();
    });
  }

  handleUrlChange() {
    console.log('[GitHub Tracker V3] URL change detected:', window.location.href);
    
    // プロジェクトページの場合のみ処理
    if (this.isProjectPage()) {
      // 少し遅延してからページの解析を実行
      setTimeout(() => {
        this.detectCurrentTaskFromPage();
      }, 500);
    }
  }

  isProjectPage() {
    return window.location.href.includes('/projects/');
  }

  // 最小限のイベント委譲（DOMポーリングなし）
  setupEventDelegation() {
    // ドラッグ&ドロップのイベントのみ監視
    const events = ['dragstart', 'dragend', 'drop'];
    
    events.forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        if (this.isCardElement(e.target)) {
          this.handleCardEvent(eventType, e);
        }
      }, { capture: true, passive: true });
    });
  }

  isCardElement(element) {
    return element.closest('.card-internal-content-module__Box--g6fvU, .jeNErH, [draggable="true"]');
  }

  handleCardEvent(eventType, e) {
    const cardElement = this.isCardElement(e.target);
    if (!cardElement) {
      console.log('[GitHub Tracker V3] Event target is not a card element:', eventType, e.target);
      return;
    }
    
    if (eventType === 'dragstart') {
      this.draggedCardInfo = this.extractCardInfo(cardElement);
      console.log('[GitHub Tracker V3] Drag started:', this.draggedCardInfo);
    }
    
    if (eventType === 'dragend' || eventType === 'drop') {
      if (this.draggedCardInfo) {
        console.log('[GitHub Tracker V3] Drag ended, waiting for GraphQL response...');
        // GraphQL レスポンスで処理されるので、ここでは待機のみ
        setTimeout(() => {
          if (this.draggedCardInfo) {
            console.log('[GitHub Tracker V3] No GraphQL response received, falling back to DOM check');
            this.fallbackDOMCheck();
          }
        }, 2000);
      }
    }
  }

  // フォールバック：GraphQLで検出できない場合のみ実行
  fallbackDOMCheck() {
    if (!this.draggedCardInfo) return;
    
    console.log('[GitHub Tracker V3] Performing fallback DOM check');
    const { title, issue } = this.draggedCardInfo;
    
    // 最小限のDOM検索
    const allCards = document.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH');
    
    for (const card of allCards) {
      const cardTitle = card.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
      const cardIssue = card.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
      
      if ((cardTitle === title) || (cardIssue === issue)) {
        const status = this.getCardStatus(card);
        if (status) {
          const taskInfo = {
            id: this.generateTaskId(cardTitle, cardIssue),
            title: cardTitle,
            status: status,
            issue: cardIssue,
            projectName: this.getProjectName()
          };
          
          console.log('[GitHub Tracker V3] Fallback detected status change:', taskInfo);
          this.sendStatusChange(taskInfo);
          break;
        }
      }
    }
    
    this.draggedCardInfo = null;
  }

  getCardStatus(cardElement) {
    let current = cardElement;
    let depth = 0;
    
    while (current && depth < 10) {
      const column = current.closest('[data-testid*="column"], [role="region"]');
      if (column) {
        const statusElement = column.querySelector('h2, h3, [data-testid*="column-name"]');
        if (statusElement) {
          return statusElement.textContent?.trim();
        }
      }
      current = current.parentElement;
      depth++;
    }
    
    return null;
  }

  // 他のタブとの同期
  setupStorageSync() {
    window.addEventListener('storage', (e) => {
      if (e.key === 'github-task-sync') {
        const syncData = JSON.parse(e.newValue);
        console.log('[GitHub Tracker V3] Sync data received:', syncData);
        this.sendStatusChange(syncData);
      }
    });
  }

  // ページから現在のタスクを検出（URL変更時のみ）
  detectCurrentTaskFromPage() {
    // 現在表示されているカード（もしあれば）を検出
    const focusedCard = document.querySelector('[aria-selected="true"], [data-focused="true"], .focused');
    if (focusedCard) {
      const cardInfo = this.extractCardInfo(focusedCard);
      if (cardInfo) {
        const status = this.getCardStatus(focusedCard);
        if (status) {
          cardInfo.status = status;
          console.log('[GitHub Tracker V3] Current task detected from page:', cardInfo);
          this.currentTaskId = cardInfo.id;
          this.currentStatus = cardInfo.status;
        }
      }
    }
  }

  sendStatusChange(taskInfo) {
    const changeData = {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: this.currentStatus,
      service: 'github',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName || this.getProjectName()
    };
    
    console.log('[GitHub Tracker V3] Sending status change:', changeData);
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        if (response && response.success) {
          console.log('[GitHub Tracker V3] Status change processed successfully');
          this.currentTaskId = taskInfo.id;
          this.currentStatus = taskInfo.status;
        }
      });
    } catch (error) {
      console.error('[GitHub Tracker V3] Error sending status change:', error);
    }
  }

  extractCardInfo(cardElement) {
    if (!cardElement) return null;
    
    const title = cardElement.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
    const issue = cardElement.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
    
    if (!title && !issue) return null;
    
    return {
      title: title || 'Untitled',
      issue: issue || '',
      id: this.generateTaskId(title, issue)
    };
  }

  generateTaskId(title, issue) {
    if (issue && issue.includes('#')) {
      const match = issue.match(/#(\d+)/);
      if (match) {
        return `github-issue-${match[1]}`;
      }
    }
    
    if (title) {
      const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      return `github-task-${cleanTitle}`;
    }
    
    return `github-task-${Date.now()}`;
  }

  getProjectName() {
    const urlMatch = window.location.href.match(/github\.com\/(orgs\/[^\/]+|users\/[^\/]+|[^\/]+\/[^\/]+)\/projects\/(\d+)/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
  }

  sendHeartbeat() {
    try {
      chrome.runtime.sendMessage({
        type: 'HEARTBEAT',
        data: { url: window.location.href }
      });
    } catch (error) {
      // Silent fail
    }
  }
}

// GitHub Projects V2 ページでのみ初期化
if (window.location.href.includes('github.com') && window.location.href.includes('/projects/')) {
  console.log('[GitHub Tracker V3] Initializing on GitHub Projects page');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new GitHubTaskTrackerV3();
    });
  } else {
    new GitHubTaskTrackerV3();
  }
  
  // ハートビート
  setInterval(() => {
    if (window.gitHubTrackerV3) {
      window.gitHubTrackerV3.sendHeartbeat();
    }
  }, 60000);
}