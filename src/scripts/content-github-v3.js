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
    
    this.init();
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
    if (!cardElement) return;
    
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