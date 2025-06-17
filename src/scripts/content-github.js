class GitHubTaskTracker {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.currentUrl = null;
    this.observer = null;
    this.cardObserver = null; // カードの移動を監視
    this.lastMovedCard = null; // 最後に移動されたカードを追跡
    this.draggedElement = null; // ドラッグ中の要素を追跡
    this.draggedCardInfo = null; // ドラッグされたカードの情報
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      this.start();
    }
  }

  start() {
    console.log('[GitHub Tracker] Starting tracker on:', window.location.href);
    
    // GitHub Projects V2は動的読み込みなので、少し待つ
    setTimeout(() => {
      this.detectCurrentTask();
      this.setupObserver();
      this.setupUrlChangeDetection();
      this.setupDragDropDetection();
      console.log('[GitHub Tracker] Tracker initialized');
    }, 1000);
    
    // さらに定期的にチェック（頻度を下げて、変更検出の精度を向上）
    setInterval(() => {
      console.log('[GitHub Tracker] Periodic check triggered');
      this.detectCurrentTask();
      this.sendHeartbeat();
    }, 10000);

    // ハートビートを送信してbackground scriptを維持
    setInterval(() => {
      this.sendHeartbeat();
    }, 60000); // 1分ごと
  }

  detectCurrentTask() {
    console.log('[GitHub Tracker] Detecting task on URL:', window.location.href);
    const taskInfo = this.extractTaskInfo();
    console.log('[GitHub Tracker] Extracted task info:', taskInfo);
    
    if (taskInfo) {
      const oldTaskId = this.currentTaskId;
      const oldStatus = this.currentStatus;
      
      this.currentTaskId = taskInfo.id;
      this.currentStatus = taskInfo.status;
      this.currentUrl = window.location.href;
      
      console.log('[GitHub Tracker] Task state updated:', {
        previous: { taskId: oldTaskId, status: oldStatus },
        current: { taskId: this.currentTaskId, status: this.currentStatus },
        isInitialDetection: !oldTaskId,
        hasChanged: oldTaskId !== this.currentTaskId || oldStatus !== this.currentStatus
      });
      
      console.log('GitHub Task detected:', {
        id: this.currentTaskId,
        status: this.currentStatus,
        title: taskInfo.title
      });

      // 初回検出でない場合（既に値が設定されていた場合）は変更として扱う
      if (oldTaskId && (oldTaskId !== this.currentTaskId || oldStatus !== this.currentStatus)) {
        console.log('[GitHub Tracker] Change detected in detectCurrentTask, triggering status change');
        this.handleStatusChangeDetected(taskInfo, oldStatus, oldTaskId);
      }
    } else {
      console.log('[GitHub Tracker] No task info found');
    }
  }

  handleStatusChangeDetected(taskInfo, oldStatus, oldTaskId) {
    console.log('[GitHub Tracker] MANUAL CHANGE DETECTED! Details:', {
      changeType: oldTaskId !== taskInfo.id ? 'TASK_CHANGE' : 'STATUS_CHANGE',
      from: { taskId: oldTaskId, status: oldStatus },
      to: { taskId: taskInfo.id, status: taskInfo.status }
    });

    console.log('[GitHub Tracker] Sending status change message to background:', {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: oldStatus,
      service: 'github',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName
    });

    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: {
          taskId: taskInfo.id,
          newStatus: taskInfo.status,
          oldStatus: oldStatus,
          service: 'github',
          taskTitle: taskInfo.title,
          projectName: taskInfo.projectName
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[GitHub Tracker] Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('[GitHub Tracker] Message sent successfully, response:', response);
        }
      });
    } catch (error) {
      console.error('[GitHub Tracker] Exception sending message:', error);
    }
  }

  extractTaskInfo() {
    let taskId = null;
    let status = null;
    let title = null;
    let projectName = null;

    const issueMatch = window.location.href.match(/github\.com\/([^\/]+\/[^\/]+)\/issues\/(\d+)/);
    const pullMatch = window.location.href.match(/github\.com\/([^\/]+\/[^\/]+)\/pull\/(\d+)/);
    const projectMatch = window.location.href.match(/github\.com\/(orgs\/[^\/]+|users\/[^\/]+|[^\/]+\/[^\/]+)\/projects\/(\d+)/);

    if (issueMatch) {
      taskId = `${issueMatch[1]}/issues/${issueMatch[2]}`;
      projectName = issueMatch[1];
      status = this.getIssueStatus();
      title = this.getIssueTitle();
    } else if (pullMatch) {
      taskId = `${pullMatch[1]}/pull/${pullMatch[2]}`;
      projectName = pullMatch[1];
      status = this.getPullRequestStatus();
      title = this.getPullRequestTitle();
    } else if (projectMatch) {
      const projectInfo = this.getProjectCardInfo();
      if (projectInfo) {
        taskId = projectInfo.id;
        status = projectInfo.status;
        title = projectInfo.title;
        projectName = projectMatch[1];
      }
    }

    return taskId && status && title ? { id: taskId, status, title, projectName } : null;
  }

  getIssueStatus() {
    const statusSelectors = [
      '.js-issue-status-badge',
      '.State',
      '[data-testid="issue-status-badge"]',
      '.gh-header-meta .State'
    ];

    for (const selector of statusSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const status = element.textContent?.trim();
        if (status) return status;
      }
    }

    const stateLabel = document.querySelector('.gh-header-meta .Label, .sidebar-labels .Label');
    if (stateLabel) {
      return stateLabel.textContent?.trim();
    }

    if (window.location.href.includes('/issues/') && document.querySelector('.octicon-issue-closed')) {
      return 'closed';
    } else if (window.location.href.includes('/issues/')) {
      return 'open';
    }

    return null;
  }

  getPullRequestStatus() {
    const statusSelectors = [
      '.js-issue-status-badge',
      '.State',
      '[data-testid="pr-status-badge"]',
      '.gh-header-meta .State'
    ];

    for (const selector of statusSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const status = element.textContent?.trim();
        if (status) return status;
      }
    }

    const mergeStatus = document.querySelector('.merge-status-item .text-emphasized');
    if (mergeStatus) {
      return mergeStatus.textContent?.trim();
    }

    if (document.querySelector('.octicon-git-merge')) {
      return 'merged';
    } else if (document.querySelector('.octicon-git-pull-request-closed')) {
      return 'closed';
    } else if (document.querySelector('.octicon-git-pull-request')) {
      return 'open';
    }

    return null;
  }

  getIssueTitle() {
    const titleSelectors = [
      '.js-issue-title',
      'h1.gh-header-title',
      '[data-testid="issue-title"]',
      'bdi.js-issue-title'
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.textContent?.trim();
        if (title) return title;
      }
    }

    const pageTitle = document.title.split(' · ')[0];
    return pageTitle || 'Unknown Issue';
  }

  getPullRequestTitle() {
    const titleSelectors = [
      '.js-issue-title',
      'h1.gh-header-title',
      '[data-testid="pr-title"]',
      'bdi.js-issue-title'
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const title = element.textContent?.trim();
        if (title) return title;
      }
    }

    const pageTitle = document.title.split(' · ')[0];
    return pageTitle || 'Unknown Pull Request';
  }

  getProjectCardInfo() {
    console.log('[GitHub Tracker] Checking for project card info');
    console.log('[GitHub Tracker] Current URL:', window.location.href);
    
    const urlMatch = window.location.href.match(/github\.com\/(orgs\/[^\/]+|users\/[^\/]+|[^\/]+\/[^\/]+)\/projects\/(\d+)/);
    if (!urlMatch) {
      console.log('[GitHub Tracker] Not a valid project URL');
      return null;
    }

    let title = null;
    let status = null;
    let taskId = null;
    let projectName = urlMatch[1];

    console.log('[GitHub Tracker] Analyzing page content...');

    // 方法1: GitHub Projects V2の実際のDOM構造から情報を抽出
    
    // タイトルを取得（実際のDOM構造に基づく）
    const titleSelectors = [
      '.title-module__SanitizedHtml_1--dvKYp', // 実際のタイトル要素
      'h3 .title-module__SanitizedHtml_1--dvKYp',
      'h3 span', // フォールバック
      '.prc-Text-Text-0ima0', // 一般的なテキスト要素
    ];

    for (const selector of titleSelectors) {
      const titleElement = document.querySelector(selector);
      if (titleElement) {
        const titleText = titleElement.textContent?.trim();
        if (titleText && titleText.length > 2 && titleText.length < 200) {
          title = titleText;
          console.log('[GitHub Tracker] Found title with selector:', selector, title);
          break;
        }
      }
    }

    // Issue/PR情報を取得
    const issueSelectors = [
      '.header-module__Text--apTHb', // "tomica-vault #6" のような形式
      'span[class*="header-module__Text"]',
    ];

    let issueInfo = null;
    for (const selector of issueSelectors) {
      const issueElement = document.querySelector(selector);
      if (issueElement) {
        const issueText = issueElement.textContent?.trim();
        if (issueText && issueText.includes('#')) {
          issueInfo = issueText;
          console.log('[GitHub Tracker] Found issue info:', issueInfo);
          break;
        }
      }
    }

    // Issue URLからタスクIDを生成
    const issueLinkSelectors = [
      'a[href*="/issues/"]',
      'a[href*="/pull/"]'
    ];

    for (const selector of issueLinkSelectors) {
      const linkElement = document.querySelector(selector);
      if (linkElement) {
        const href = linkElement.getAttribute('href');
        const match = href.match(/github\.com\/([^\/]+\/[^\/]+)\/(issues|pull)\/(\d+)/);
        if (match) {
          taskId = `${match[1]}/${match[2]}/${match[3]}`;
          console.log('[GitHub Tracker] Found task ID from link:', taskId);
          break;
        }
      }
    }

    // ステータスを検索（移動されたタスクを特定）
    let cardElement = null;
    let targetCard = null;

    // 方法1: フォーカスされたまたは選択されたカードを探す
    const focusedSelectors = [
      '[data-focused="true"]',
      '[aria-selected="true"]',
      '.focused',
      '.selected',
      '[tabindex="0"]'
    ];

    for (const selector of focusedSelectors) {
      const focused = document.querySelector(selector);
      if (focused) {
        // フォーカス要素から最も近いカード要素を探す
        targetCard = focused.closest('.card-internal-content-module__Box--g6fvU') ||
                    focused.closest('.jeNErH') ||
                    focused.querySelector('.card-internal-content-module__Box--g6fvU');
        if (targetCard) {
          console.log('[GitHub Tracker] Found focused/selected card with selector:', selector);
          break;
        }
      }
    }

    // 方法2: 最近移動されたカード（アニメーション中など）を探す
    if (!targetCard) {
      const animatedSelectors = [
        '[style*="transform"]',
        '[class*="animate"]',
        '[class*="transition"]'
      ];

      for (const selector of animatedSelectors) {
        const animated = document.querySelector(selector);
        if (animated) {
          targetCard = animated.closest('.card-internal-content-module__Box--g6fvU') ||
                      animated.closest('.jeNErH');
          if (targetCard) {
            console.log('[GitHub Tracker] Found animated card with selector:', selector);
            break;
          }
        }
      }
    }

    // 方法3: 全てのカードを調査して、「now」列にあるカードを探す
    if (!targetCard) {
      const allCards = document.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH');
      console.log('[GitHub Tracker] Checking all cards for status:', allCards.length);

      for (const card of allCards) {
        // このカードが配置されている列のステータスを取得
        let columnElement = card;
        let maxDepth = 15;
        let cardStatus = null;

        while (columnElement && maxDepth > 0) {
          const h2InColumn = columnElement.querySelector('h2') ||
                            columnElement.parentElement?.querySelector('h2');
          
          if (h2InColumn) {
            const statusText = h2InColumn.textContent?.trim();
            if (statusText && statusText.toLowerCase() !== 'no status') {
              cardStatus = statusText;
              break;
            }
          }
          columnElement = columnElement.parentElement;
          maxDepth--;
        }

        // このカードの情報をログ出力
        const cardTitle = card.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
        const cardIssue = card.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
        
        console.log('[GitHub Tracker] Card analysis:', {
          title: cardTitle,
          issue: cardIssue,
          status: cardStatus
        });

        // 「now」ステータスのカードを優先的に選択
        if (cardStatus && cardStatus.toLowerCase() === 'now') {
          targetCard = card;
          console.log('[GitHub Tracker] Found card in "now" status');
          break;
        }
      }
    }

    // フォールバック: 最初のカードを使用
    if (!targetCard) {
      const cardSelectors = [
        '.card-internal-content-module__Box--g6fvU',
        '.jeNErH',
        'a[href*="/issues/"]',
        'h3',
      ];

      for (const selector of cardSelectors) {
        targetCard = document.querySelector(selector);
        if (targetCard) {
          console.log('[GitHub Tracker] Using fallback card with selector:', selector);
          break;
        }
      }
    }

    cardElement = targetCard;

    if (cardElement) {
      // カード要素から親の列要素を辿ってステータスを取得
      let columnElement = cardElement;
      let maxDepth = 10; // 無限ループ防止
      
      while (columnElement && maxDepth > 0) {
        // 現在の要素またはその兄弟要素でh2を探す
        const h2InColumn = columnElement.querySelector('h2') || 
                          columnElement.closest('[data-column-id]')?.querySelector('h2') ||
                          columnElement.parentElement?.querySelector('h2');
        
        if (h2InColumn) {
          const statusText = h2InColumn.textContent?.trim();
          console.log('[GitHub Tracker] Found h2 in column context:', statusText);
          
          if (statusText && statusText.toLowerCase() !== 'no status' && statusText.length < 50) {
            status = statusText;
            console.log('[GitHub Tracker] Found status from card column:', status);
            break;
          }
        }
        
        columnElement = columnElement.parentElement;
        maxDepth--;
      }
    }

    // フォールバック1: 全てのh2要素をチェックして有効なステータスを探す
    if (!status || status.toLowerCase() === 'no status') {
      const h2Elements = document.querySelectorAll('h2');
      console.log('[GitHub Tracker] Checking all h2 elements for valid status:', h2Elements.length);
      
      for (const h2 of h2Elements) {
        const text = h2.textContent?.trim();
        console.log('[GitHub Tracker] H2 text:', text);
        
        // 有効なステータス値のみを受け入れる
        const validStatuses = ['now', 'in progress', 'doing', 'todo', 'done', 'backlog', 'ready', 'review'];
        if (text && validStatuses.includes(text.toLowerCase())) {
          status = text;
          console.log('[GitHub Tracker] Found valid status in h2:', status);
          break;
        }
      }
    }

    // フォールバック2: URLのフラグメントやクエリパラメータをチェック
    if (!status || status.toLowerCase() === 'no status') {
      const urlParams = new URLSearchParams(window.location.search);
      const statusParam = urlParams.get('status') || urlParams.get('column');
      if (statusParam) {
        status = statusParam;
        console.log('[GitHub Tracker] Found status from URL params:', status);
      }
    }

    // フォールバック: URLやページタイトルから情報を取得
    if (!taskId) {
      const itemMatch = window.location.href.match(/items\/(\d+)/);
      if (itemMatch) {
        taskId = `${urlMatch[1]}/projects/${urlMatch[2]}/items/${itemMatch[1]}`;
      } else if (issueInfo) {
        // "tomica-vault #6" のような形式から推測
        const parts = issueInfo.split('#');
        if (parts.length === 2) {
          const repoName = parts[0].trim();
          const issueNumber = parts[1].trim();
          taskId = `${projectName}/${repoName}/issues/${issueNumber}`;
        }
      } else {
        taskId = `${urlMatch[1]}/projects/${urlMatch[2]}/general`;
      }
      console.log('[GitHub Tracker] Generated fallback task ID:', taskId);
    }

    if (!title && issueInfo) {
      title = issueInfo;
      console.log('[GitHub Tracker] Using issue info as title:', title);
    } else if (!title) {
      title = `Project ${urlMatch[2]} Item`;
      console.log('[GitHub Tracker] Using default title:', title);
    }

    console.log('[GitHub Tracker] Final project card analysis result:', { 
      taskId, 
      title, 
      status: status || 'unknown',
      projectName 
    });
    
    return taskId ? { 
      id: taskId, 
      title, 
      status: status || 'unknown',
      projectName 
    } : null;
  }

  setupObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldCheck = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          
          if (addedNodes.some(node => 
            node.nodeType === 1 && (
              node.matches && (
                node.matches('.State') ||
                node.matches('.js-issue-status-badge') ||
                node.matches('.merge-status-item') ||
                node.matches('.project-card') ||
                node.matches('[data-testid="project-item"]') ||
                node.matches('[data-testid="status-field"]') ||
                node.matches('[data-testid="single-select-field"]') ||
                node.querySelector('.State, .js-issue-status-badge, .merge-status-item, .project-card, [data-testid="project-item"], [data-testid="status-field"], [data-testid="single-select-field"]')
              )
            )
          )) {
            shouldCheck = true;
          }
        } else if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (target.classList.contains('State') ||
              target.classList.contains('js-issue-status-badge') ||
              target.classList.contains('merge-status-item') ||
              target.classList.contains('project-card') ||
              target.hasAttribute('data-testid') ||
              target.hasAttribute('data-field-type')) {
            shouldCheck = true;
          }
        }
      });

      if (shouldCheck) {
        setTimeout(() => this.checkForStatusChange(), 100);
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-status', 'data-state', 'data-testid', 'data-field-type', 'title', 'aria-label']
    });
  }

  setupUrlChangeDetection() {
    let lastUrl = location.href;
    
    const checkUrlChange = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          this.detectCurrentTask();
        }, 500);
      }
    };

    setInterval(checkUrlChange, 1000);

    window.addEventListener('popstate', checkUrlChange);
    
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(checkUrlChange, 100);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(checkUrlChange, 100);
    };

    document.addEventListener('click', (e) => {
      if (e.target.closest('a[href*="/issues/"], a[href*="/pull/"], a[href*="/projects/"]')) {
        setTimeout(checkUrlChange, 500);
      }
    });
  }

  checkForStatusChange() {
    console.log('[GitHub Tracker] Checking for status change...');
    const taskInfo = this.extractTaskInfo();
    if (!taskInfo) {
      console.log('[GitHub Tracker] No task info found during status check');
      return;
    }

    const { id: taskId, status: newStatus, title, projectName } = taskInfo;
    console.log('[GitHub Tracker] Current state comparison:', {
      currentTaskId: this.currentTaskId,
      currentStatus: this.currentStatus,
      currentUrl: this.currentUrl,
      newTaskId: taskId,
      newStatus: newStatus,
      newUrl: window.location.href,
      taskIdChanged: taskId !== this.currentTaskId,
      statusChanged: newStatus !== this.currentStatus,
      urlChanged: window.location.href !== this.currentUrl
    });
    
    if (taskId !== this.currentTaskId || newStatus !== this.currentStatus || 
        window.location.href !== this.currentUrl) {
      
      const oldStatus = this.currentStatus;
      const oldTaskId = this.currentTaskId;

      console.log('[GitHub Tracker] CHANGE DETECTED! Details:', {
        changeType: taskId !== this.currentTaskId ? 'TASK_CHANGE' : 
                   newStatus !== this.currentStatus ? 'STATUS_CHANGE' : 'URL_CHANGE',
        from: { taskId: oldTaskId, status: oldStatus },
        to: { taskId: taskId, status: newStatus }
      });

      this.currentTaskId = taskId;
      this.currentStatus = newStatus;
      this.currentUrl = window.location.href;

      console.log('[GitHub Tracker] Sending status change message to background:', {
        taskId,
        newStatus,
        oldStatus,
        service: 'github',
        taskTitle: title,
        projectName
      });

      try {
        chrome.runtime.sendMessage({
          type: 'TASK_STATUS_CHANGED',
          data: {
            taskId,
            newStatus,
            oldStatus,
            service: 'github',
            taskTitle: title,
            projectName
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[GitHub Tracker] Error sending message:', chrome.runtime.lastError);
          } else {
            console.log('[GitHub Tracker] Message sent successfully, response:', response);
          }
        });
      } catch (error) {
        console.error('[GitHub Tracker] Exception sending message:', error);
      }

      console.log('GitHub status change detected:', {
        taskId,
        oldStatus,
        newStatus,
        title
      });
    } else {
      console.log('[GitHub Tracker] No change detected - all values are the same');
    }
  }

  setupDragDropDetection() {
    console.log('[GitHub Tracker] Setting up enhanced drag & drop detection v2.0');
    
    // 1. カラム状態の監視システム
    this.columnStates = new Map();
    this.initializeColumnStates();
    
    // 2. 包括的なイベント検出
    const events = ['dragstart', 'dragend', 'drop', 'mousedown', 'mouseup', 'click', 'focusin', 'focusout'];
    
    events.forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        this.handleCardInteraction(eventType, e);
      }, { capture: true, passive: true });
    });
    
    // 3. 高頻度MutationObserver
    this.setupAdvancedMutationObserver();
    
    // 4. 定期的な状態チェック（フォールバック）
    this.setupPeriodicStateCheck();
    
    // 5. IntersectionObserver（カードの表示状態変更検出）
    this.setupIntersectionObserver();
  }
  
  initializeColumnStates() {
    // より包括的なカラム検出
    const columnSelectors = [
      '[data-testid*="column"]', 
      '[role="region"]', 
      '.projects-v2-board-column',
      '.board-column',
      '.project-column'
    ];
    
    let columns = [];
    columnSelectors.forEach(selector => {
      const found = document.querySelectorAll(selector);
      columns = columns.concat(Array.from(found));
    });
    
    // 重複削除
    columns = [...new Set(columns)];
    
    console.log(`[GitHub Tracker] Found ${columns.length} columns to initialize`);
    
    columns.forEach((column, index) => {
      // より包括的なステータス検出
      const statusSelectors = [
        'h2', 'h3', 'h4',
        '[data-testid*="column-name"]',
        '[role="columnheader"]',
        '.column-title',
        '.projects-v2-board-column-header'
      ];
      
      let status = null;
      for (const selector of statusSelectors) {
        const statusElement = column.querySelector(selector);
        if (statusElement) {
          const statusText = statusElement.textContent?.trim();
          if (statusText && statusText.length > 0 && statusText.length < 50) {
            status = statusText;
            console.log(`[GitHub Tracker] Found column status with selector "${selector}": "${status}"`);
            break;
          }
        }
      }
      
      if (!status) {
        status = `Column ${index}`;
        console.log(`[GitHub Tracker] Using fallback status: "${status}"`);
      }
      
      const cards = Array.from(column.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH'));
      const cardTitles = cards.map(card => {
        const title = card.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
        const issue = card.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
        return { title, issue, element: card };
      }).filter(card => card.title);
      
      this.columnStates.set(status, cardTitles);
      console.log(`[GitHub Tracker] Column "${status}" initialized with ${cardTitles.length} cards`);
    });
  }
  
  handleCardInteraction(eventType, e) {
    const cardElement = e.target.closest('.card-internal-content-module__Box--g6fvU, .jeNErH, [draggable="true"]');
    if (!cardElement) return;
    
    const cardInfo = this.extractCardInfo(cardElement);
    if (!cardInfo) return;
    
    console.log(`[GitHub Tracker] ${eventType} detected on card: "${cardInfo.title}"`);
    
    if (['dragstart', 'mousedown', 'focusin'].includes(eventType)) {
      this.draggedCardInfo = cardInfo;
      this.dragStartTime = Date.now();
      this.originalCardElement = cardElement;
      console.log('[GitHub Tracker] Drag/interaction started:', cardInfo);
    }
    
    if (['dragend', 'mouseup', 'drop', 'focusout'].includes(eventType)) {
      if (this.draggedCardInfo) {
        console.log('[GitHub Tracker] Drag/interaction ended, triggering immediate check');
        // 即座にチェックを実行
        this.performImmediateMovementCheck();
        
        // 遅延チェックも実行（フォールバック）
        setTimeout(() => this.performImmediateMovementCheck(), 150);
        setTimeout(() => this.performImmediateMovementCheck(), 500);
        setTimeout(() => this.performImmediateMovementCheck(), 1000);
      }
    }
  }
  
  performImmediateMovementCheck() {
    if (!this.draggedCardInfo) return;
    
    const { title, issue } = this.draggedCardInfo;
    console.log(`[GitHub Tracker] Performing immediate check for moved card: "${title}"`);
    
    // 全カラムをスキャンして移動先を特定
    const columns = document.querySelectorAll('[data-testid*="column"], [role="region"]');
    
    for (const column of columns) {
      const statusElement = column.querySelector('h2, h3, [data-testid*="column-name"]');
      const status = statusElement?.textContent?.trim();
      
      if (!status || status.toLowerCase() === 'no status') continue;
      
      const cards = column.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH');
      
      for (const card of cards) {
        const cardTitle = card.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
        const cardIssue = card.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
        
        // タイトルまたはIssue番号でマッチング
        if ((cardTitle && cardTitle === title) || (cardIssue && cardIssue === issue)) {
          console.log(`[GitHub Tracker] FOUND MOVED CARD! "${title}" -> "${status}"`);
          
          // ステータス変更を即座に処理
          this.processCardStatusChange({
            id: this.generateTaskId(cardTitle, cardIssue),
            title: cardTitle,
            status: status,
            issue: cardIssue,
            projectName: this.getProjectName()
          });
          
          // 処理済みフラグをセット
          this.draggedCardInfo = null;
          return;
        }
      }
    }
    
    console.log(`[GitHub Tracker] Card "${title}" not found in current check`);
  }
  
  setupAdvancedMutationObserver() {
    if (this.cardObserver) {
      this.cardObserver.disconnect();
    }
    
    this.cardObserver = new MutationObserver((mutations) => {
      let hasCardMovement = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // カードの追加/削除を検出
          const hasCardNodes = [...mutation.addedNodes, ...mutation.removedNodes].some(node => 
            node.nodeType === 1 && (
              node.classList?.contains('card-internal-content-module__Box--g6fvU') ||
              node.classList?.contains('jeNErH') ||
              node.querySelector?.('.card-internal-content-module__Box--g6fvU, .jeNErH')
            )
          );
          
          if (hasCardNodes) {
            hasCardMovement = true;
          }
        }
      });
      
      if (hasCardMovement && this.draggedCardInfo) {
        console.log('[GitHub Tracker] Card movement detected via MutationObserver');
        // 即座に処理
        setTimeout(() => this.performImmediateMovementCheck(), 50);
      }
    });

    // より詳細な監視設定
    this.cardObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-testid', 'aria-selected']
    });
  }
  
  setupPeriodicStateCheck() {
    // 5秒ごとに状態をチェック（フォールバック）
    setInterval(() => {
      if (this.draggedCardInfo && Date.now() - this.dragStartTime > 2000) {
        console.log('[GitHub Tracker] Periodic fallback check triggered');
        this.performImmediateMovementCheck();
      }
    }, 5000);
  }
  
  setupIntersectionObserver() {
    this.intersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && this.draggedCardInfo) {
          const cardElement = entry.target;
          const cardTitle = cardElement.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
          
          if (cardTitle === this.draggedCardInfo.title) {
            console.log('[GitHub Tracker] Moved card became visible via IntersectionObserver');
            setTimeout(() => this.performImmediateMovementCheck(), 100);
          }
        }
      });
    });
    
    // 既存のカードを監視対象に追加
    document.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH').forEach(card => {
      this.intersectionObserver.observe(card);
    });
  }
  
  processCardStatusChange(cardInfo) {
    console.log('[GitHub Tracker] Processing card status change:', cardInfo);
    
    // 旧のステータスを取得（必要に応じて）
    const oldStatus = this.currentStatus;
    const oldTaskId = this.currentTaskId;
    
    // 新しい状態を設定
    this.currentTaskId = cardInfo.id;
    this.currentStatus = cardInfo.status;
    
    // Background scriptに状態変更を通知
    const changeData = {
      taskId: cardInfo.id,
      newStatus: cardInfo.status,
      oldStatus: oldStatus,
      service: 'github',
      taskTitle: cardInfo.title,
      projectName: cardInfo.projectName || this.getProjectName()
    };
    
    console.log('[GitHub Tracker] Sending status change:', changeData);
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        if (response && response.success) {
          console.log('[GitHub Tracker] Status change processed successfully');
        } else {
          console.error('[GitHub Tracker] Failed to process status change:', response);
        }
      });
    } catch (error) {
      console.error('[GitHub Tracker] Error sending status change:', error);
    }
  }
  
  generateTaskId(title, issue) {
    if (issue && issue.includes('#')) {
      // Issue番号があればそれを使用
      const match = issue.match(/#(\d+)/);
      if (match) {
        return `github-issue-${match[1]}`;
      }
    }
    
    // タイトルからIDを生成
    if (title) {
      const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      return `github-task-${cleanTitle}`;
    }
    
    // フォールバック
    return `github-task-${Date.now()}`;
  }
  
  getProjectName() {
    const urlMatch = window.location.href.match(/github\.com\/(orgs\/[^\/]+|users\/[^\/]+|[^\/]+\/[^\/]+)\/projects\/(\d+)/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
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

  scheduleMovedCardCheck() {
    console.log('[GitHub Tracker] Scheduling moved card checks');
    
    // 即座に1回目のチェック
    setTimeout(() => {
      console.log('[GitHub Tracker] Immediate check for moved card');
      if (this.draggedCardInfo) {
        const found = this.findMovedCardByTitle();
        if (found) {
          console.log('[GitHub Tracker] Found moved card immediately!');
          return;
        }
      }
      
      // 失敗した場合、段階的にリトライ
      const checkTimes = [300, 700, 1500, 3000]; // より短い間隔で開始
      let checkCompleted = false;
      
      checkTimes.forEach((delay, index) => {
        setTimeout(() => {
          if (!checkCompleted && this.draggedCardInfo) {
            console.log(`[GitHub Tracker] Retry ${index + 1}: Checking moved card after ${delay}ms`);
            
            const found = this.findMovedCardByTitle();
            if (found) {
              checkCompleted = true;
              console.log(`[GitHub Tracker] Successfully found moved card on retry ${index + 1}`);
            }
          }
        }, delay);
      });
    }, 100);
  }

  findMovedCardByTitle() {
    if (!this.draggedCardInfo) {
      console.log('[GitHub Tracker] No dragged card info available');
      this.findAndTrackNowColumnCards();
      return false;
    }

    console.log('[GitHub Tracker] Searching for moved card by title:', this.draggedCardInfo);
    
    // ページ内の全カードから、ドラッグされたカードと同じタイトルのものを探す
    const allCards = document.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH');
    let foundCard = null;

    for (const card of allCards) {
      const title = card.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
      const issue = card.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
      
      // タイトルまたはIssue番号でマッチング
      if ((title && title === this.draggedCardInfo.title) || 
          (issue && issue === this.draggedCardInfo.issue)) {
        
        // このカードが「now」列にあるかチェック
        const cardStatus = this.getCardStatus(card);
        console.log(`[GitHub Tracker] Found matching card: "${title}" with status: "${cardStatus}"`);
        
        if (cardStatus && cardStatus.toLowerCase() === 'now') {
          foundCard = card;
          console.log('[GitHub Tracker] Found moved card in "now" column!');
          break;
        }
      }
    }

    if (foundCard) {
      this.lastMovedCard = foundCard;
      this.checkMovedCardStatus();
      
      // 成功時にドラッグ情報をクリア
      this.draggedCardInfo = null;
      return true;
    } else {
      console.log('[GitHub Tracker] Could not find moved card in this attempt');
      return false;
    }
  }

  getCardStatus(cardElement) {
    // カードが配置されている列のステータスを取得
    let columnElement = cardElement;
    let maxDepth = 15;

    while (columnElement && maxDepth > 0) {
      const h2InColumn = columnElement.querySelector('h2') ||
                        columnElement.parentElement?.querySelector('h2');
      
      if (h2InColumn) {
        const statusText = h2InColumn.textContent?.trim();
        if (statusText && statusText.toLowerCase() !== 'no status') {
          return statusText;
        }
      }
      columnElement = columnElement.parentElement;
      maxDepth--;
    }
    return null;
  }

  findAndTrackNowColumnCards() {
    console.log('[GitHub Tracker] Searching for cards in "now" column');
    
    // ドラッグされたカードが分かっている場合は、そのカードを優先
    if (this.draggedElement) {
      console.log('[GitHub Tracker] Using dragged element as target card');
      this.lastMovedCard = this.draggedElement;
      this.checkMovedCardStatus();
      return;
    }
    
    // 「now」列のヘッダーを探す
    const allH2 = document.querySelectorAll('h2');
    let nowColumn = null;
    
    for (const h2 of allH2) {
      const text = h2.textContent?.trim().toLowerCase();
      if (text === 'now') {
        nowColumn = h2.closest('[data-column-id]') || h2.parentElement;
        console.log('[GitHub Tracker] Found "now" column:', nowColumn);
        break;
      }
    }
    
    if (nowColumn) {
      // この列内のカードを探す
      const cardsInColumn = nowColumn.querySelectorAll('.card-internal-content-module__Box--g6fvU, .jeNErH');
      console.log('[GitHub Tracker] Cards found in "now" column:', cardsInColumn.length);
      
      cardsInColumn.forEach((card, index) => {
        const title = card.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
        const issue = card.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
        console.log(`[GitHub Tracker] Card ${index} in "now":`, { title, issue });
      });
      
      // 最後に移動されたカードがない場合のみ、最初のカードを使用
      if (!this.lastMovedCard && cardsInColumn.length > 0) {
        console.log('[GitHub Tracker] No specific moved card, using first card in now column');
        this.lastMovedCard = cardsInColumn[0];
        this.checkMovedCardStatus();
      }
    }
  }

  checkMovedCardStatus() {
    if (!this.lastMovedCard) {
      console.log('[GitHub Tracker] No moved card to check');
      return;
    }

    console.log('[GitHub Tracker] Checking status of moved card');
    
    // 移動されたカードの情報を取得
    const title = this.lastMovedCard.querySelector('.title-module__SanitizedHtml_1--dvKYp')?.textContent?.trim();
    const issueInfo = this.lastMovedCard.querySelector('.header-module__Text--apTHb')?.textContent?.trim();
    const issueLink = this.lastMovedCard.querySelector('a[href*="/issues/"], a[href*="/pull/"]');
    
    let taskId = null;
    if (issueLink) {
      const href = issueLink.getAttribute('href');
      const match = href.match(/github\.com\/([^\/]+\/[^\/]+)\/(issues|pull)\/(\d+)/);
      if (match) {
        taskId = `${match[1]}/${match[2]}/${match[3]}`;
      }
    }

    // 移動されたカードが配置されている列のステータスを取得
    let columnElement = this.lastMovedCard;
    let newStatus = null;
    let maxDepth = 15;

    while (columnElement && maxDepth > 0) {
      const h2InColumn = columnElement.querySelector('h2') ||
                        columnElement.parentElement?.querySelector('h2');
      
      if (h2InColumn) {
        const statusText = h2InColumn.textContent?.trim();
        if (statusText && statusText.toLowerCase() !== 'no status') {
          newStatus = statusText;
          break;
        }
      }
      columnElement = columnElement.parentElement;
      maxDepth--;
    }

    console.log('[GitHub Tracker] Moved card analysis:', {
      title,
      issueInfo,
      taskId,
      newStatus
    });

    if (taskId && newStatus) {
      const urlMatch = window.location.href.match(/github\.com\/(orgs\/[^\/]+|users\/[^\/]+|[^\/]+\/[^\/]+)\/projects\/(\d+)/);
      const projectName = urlMatch ? urlMatch[1] : 'unknown';

      // 前回の状態と比較
      if (taskId !== this.currentTaskId || newStatus !== this.currentStatus) {
        const oldStatus = this.currentStatus;
        const oldTaskId = this.currentTaskId;

        this.currentTaskId = taskId;
        this.currentStatus = newStatus;
        this.currentUrl = window.location.href;

        console.log('[GitHub Tracker] MOVED CARD STATUS CHANGE DETECTED!', {
          from: { taskId: oldTaskId, status: oldStatus },
          to: { taskId: taskId, status: newStatus }
        });

        this.sendStatusChangeMessage({
          id: taskId,
          status: newStatus,
          title: title || issueInfo,
          projectName
        }, oldStatus, oldTaskId);
      }
    }
  }

  sendStatusChangeMessage(taskInfo, oldStatus, oldTaskId) {
    console.log('[GitHub Tracker] Sending status change message to background:', {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: oldStatus,
      service: 'github',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName
    });

    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: {
          taskId: taskInfo.id,
          newStatus: taskInfo.status,
          oldStatus: oldStatus,
          service: 'github',
          taskTitle: taskInfo.title,
          projectName: taskInfo.projectName
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[GitHub Tracker] Error sending message:', chrome.runtime.lastError);
        } else {
          console.log('[GitHub Tracker] Message sent successfully, response:', response);
        }
      });
    } catch (error) {
      console.error('[GitHub Tracker] Exception sending message:', error);
    }
  }

  sendHeartbeat() {
    try {
      chrome.runtime.sendMessage({
        type: 'HEARTBEAT',
        data: {
          url: window.location.href,
          timestamp: Date.now()
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[GitHub Tracker] Background script may be sleeping, this is normal');
        }
      });
    } catch (error) {
      console.log('[GitHub Tracker] Heartbeat failed, background script may be sleeping');
    }
  }
}

if (window.location.hostname === 'github.com') {
  new GitHubTaskTracker();
}