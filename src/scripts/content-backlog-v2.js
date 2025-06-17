class BacklogTaskTrackerV2 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.draggedCardInfo = null;
    
    // Backlog API のネットワークリクエストを監視
    this.originalFetch = window.fetch;
    this.originalXHROpen = XMLHttpRequest.prototype.open;
    this.originalXHRSend = XMLHttpRequest.prototype.send;
    
    this.init();
  }

  init() {
    console.log('[Backlog Tracker V2] Initializing network-based tracking');
    
    // 1. Network interception (最も効率的)
    this.interceptNetworkRequests();
    
    // 2. Minimal event delegation (フォールバック)
    this.setupMinimalEventDelegation();
    
    // 3. URL change monitoring
    this.setupUrlMonitoring();
    
    console.log('[Backlog Tracker V2] Initialization complete');
  }

  // Backlog カンバンボード API を監視
  interceptNetworkRequests() {
    console.log('[Backlog Tracker V2] Setting up network interception');
    
    // Fetch API の監視
    window.fetch = async (...args) => {
      const url = args[0];
      const options = args[1];
      
      // すべてのリクエストをログ（デバッグ用）
      console.log('[Backlog Tracker V2] Fetch request intercepted:', {
        url: url,
        method: options?.method || 'GET',
        body: options?.body ? 'Present' : 'None',
        timestamp: new Date().toISOString()
      });
      
      const response = await this.originalFetch.apply(window, args);
      
      // 非同期でレスポンス解析
      setTimeout(() => {
        this.analyzeNetworkRequest(args[0], args[1], response.clone());
      }, 0);
      
      return response;
    };

    // XMLHttpRequest の監視
    const tracker = this;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._url = url;
      this._method = method;
      this._tracker = tracker;
      console.log('[Backlog Tracker V2] XHR request opened:', {
        method: method,
        url: url
      });
      return tracker.originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function(data) {
      this._requestData = data;
      console.log('[Backlog Tracker V2] XHR request sent:', {
        url: this._url,
        method: this._method,
        data: data ? 'Present' : 'None'
      });
      
      this.addEventListener('load', function() {
        console.log('[Backlog Tracker V2] XHR response received:', {
          url: this._url,
          status: this.status,
          responseLength: this.responseText ? this.responseText.length : 0
        });
        this._tracker.analyzeXHRResponse(this);
      });
      
      return tracker.originalXHRSend.apply(this, [data]);
    };
    
    window.backlogTracker = this;
  }

  async analyzeNetworkRequest(url, options, response) {
    try {
      // すべてのBacklogドメインのリクエストをログ出力
      if (typeof url === 'string' && url.includes('.backlog.')) {
        console.log('[Backlog Tracker V2] All Backlog requests:', {
          url: url,
          method: options?.method || 'GET',
          isBacklogAPI: this.isBacklogKanbanAPI(url)
        });
      }
      
      // Backlog カンバンボード API のリクエストを検出
      if (typeof url === 'string' && this.isBacklogKanbanAPI(url)) {
        console.log('[Backlog Tracker V2] Backlog kanban API detected:', url);
        
        const responseData = await response.json();
        console.log('[Backlog Tracker V2] Response data received:', responseData);
        this.processBacklogAPIResponse(responseData, url);
      }
    } catch (error) {
      if (typeof url === 'string' && url.includes('.backlog.')) {
        console.log('[Backlog Tracker V2] Error analyzing Backlog request:', {
          url: url,
          error: error.message
        });
      }
    }
  }

  analyzeXHRResponse(xhr) {
    // すべてのBacklogドメインのXHRをログ出力
    if (xhr._url && xhr._url.includes('.backlog.')) {
      console.log('[Backlog Tracker V2] All Backlog XHR responses:', {
        url: xhr._url,
        method: xhr._method,
        status: xhr.status,
        isBacklogAPI: this.isBacklogKanbanAPI(xhr._url),
        hasResponseText: !!xhr.responseText,
        responseTextLength: xhr.responseText ? xhr.responseText.length : 0
      });
    }
    
    if (xhr._url && this.isBacklogKanbanAPI(xhr._url) && xhr.responseText) {
      try {
        const response = JSON.parse(xhr.responseText);
        console.log('[Backlog Tracker V2] XHR Response data received:', response);
        this.processBacklogAPIResponse(response, xhr._url);
      } catch (error) {
        console.error('[Backlog Tracker V2] Error parsing XHR response:', {
          error: error.message,
          responseText: xhr.responseText.substring(0, 500) // 最初の500文字のみ
        });
      }
    }
  }

  isBacklogKanbanAPI(url) {
    // ワイルドカードでスペースIDを含むBacklog API URLを検出
    // 例: https://way-space.backlog.com/board-api/kanban
    // 例: https://other-space.backlog.jp/board-api/kanban
    // より広範囲のAPIパターンをチェック
    const backlogAPIPatterns = [
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/board-api\/kanban/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/api\/v2\/projects\/\d+\/boards/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/api\/.*kanban/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/.*board.*api/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/.*api.*board/
    ];
    
    const isMatch = backlogAPIPatterns.some(pattern => pattern.test(url));
    
    console.log('[Backlog Tracker V2] URL pattern check:', {
      url: url,
      patterns: backlogAPIPatterns.map(p => p.toString()),
      isMatch: isMatch
    });
    
    return isMatch;
  }

  processBacklogAPIResponse(responseData, url) {
    console.log('[Backlog Tracker V2] Processing Backlog API response:', responseData);
    
    // updateCard レスポンスを検出
    if (responseData.updateCard) {
      this.handleCardUpdate(responseData.updateCard);
    }
    
    // その他のカード操作も検出
    if (responseData.createCard) {
      this.handleCardCreate(responseData.createCard);
    }
    
    if (responseData.deleteCard) {
      this.handleCardDelete(responseData.deleteCard);
    }
    
    // バッチ更新の場合
    if (responseData.cards && Array.isArray(responseData.cards)) {
      responseData.cards.forEach(card => {
        if (card.updateCard) {
          this.handleCardUpdate(card.updateCard);
        }
      });
    }
  }

  handleCardUpdate(updateCard) {
    console.log('[Backlog Tracker V2] Card update detected:', updateCard);
    
    // Backlog API レスポンスからタスク情報を構築
    const taskInfo = this.extractTaskInfoFromBacklogAPI(updateCard);
    if (taskInfo) {
      console.log('[Backlog Tracker V2] Task status change via Backlog API:', taskInfo);
      this.sendStatusChange(taskInfo);
    } else {
      console.log('[Backlog Tracker V2] Failed to extract task info from updateCard:', updateCard);
    }
  }

  handleCardCreate(createCard) {
    console.log('[Backlog Tracker V2] Card creation detected:', createCard);
    // 必要に応じて新しいカード作成を処理
  }

  handleCardDelete(deleteCard) {
    console.log('[Backlog Tracker V2] Card deletion detected:', deleteCard);
    // 必要に応じてカード削除を処理
  }

  extractTaskInfoFromBacklogAPI(updateCard) {
    try {
      console.log('[Backlog Tracker V2] Extracting task info from updateCard:', updateCard);
      
      const { issue, id } = updateCard;
      
      if (!issue) {
        console.log('[Backlog Tracker V2] No issue data in updateCard');
        return null;
      }
      
      console.log('[Backlog Tracker V2] Issue data found:', issue);
      
      const {
        issueKey,
        id: issueId,
        summary: title,
        status,
        projectId
      } = issue;
      
      console.log('[Backlog Tracker V2] Extracted fields:', {
        issueKey,
        issueId,
        title,
        status,
        projectId
      });
      
      if (!status || !title) {
        console.log('[Backlog Tracker V2] Missing required fields:', { status, title });
        return null;
      }
      
      const taskInfo = {
        id: this.generateTaskId(issueKey, issueId),
        title: title,
        status: status.name, // "処理中" など
        issueKey: issueKey, // "TEST-4" など
        issueId: issueId,
        projectId: projectId,
        projectName: this.getProjectName()
      };
      
      console.log('[Backlog Tracker V2] Extracted task info:', taskInfo);
      return taskInfo;
      
    } catch (error) {
      console.error('[Backlog Tracker V2] Error extracting Backlog API data:', {
        error: error.message,
        stack: error.stack,
        updateCard: updateCard
      });
      return null;
    }
  }

  generateTaskId(issueKey, issueId) {
    // Issue Key（TEST-4など）があればそれを使用
    if (issueKey) {
      return `backlog-${issueKey}`;
    }
    
    // Issue IDをフォールバックとして使用
    if (issueId) {
      return `backlog-issue-${issueId}`;
    }
    
    // 最終フォールバック
    return `backlog-task-${Date.now()}`;
  }

  getProjectName() {
    // URLからプロジェクト名を抽出
    const urlMatch = window.location.href.match(/\/projects\/([^\/]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    // ページタイトルから抽出を試みる
    const titleMatch = document.title.match(/^([^-]+)/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    
    return 'Unknown Project';
  }

  // 最小限のイベント委譲（フォールバック）
  setupMinimalEventDelegation() {
    console.log('[Backlog Tracker V2] Setting up minimal event delegation');
    
    // より広範囲のイベント監視
    const events = ['dragstart', 'dragend', 'drop', 'mousedown', 'mouseup', 'click'];
    
    events.forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        // すべてのイベントをログ（デバッグ用）
        if (eventType === 'dragstart' || eventType === 'dragend' || eventType === 'drop') {
          console.log(`[Backlog Tracker V2] ${eventType} event detected on:`, {
            target: e.target.tagName,
            className: e.target.className,
            id: e.target.id
          });
        }
        
        if (this.isBacklogCard(e.target)) {
          this.handleCardEvent(eventType, e);
        } else if (eventType === 'dragstart' || eventType === 'dragend' || eventType === 'drop') {
          // カード以外の要素でもドラッグイベントをログ
          console.log(`[Backlog Tracker V2] ${eventType} on non-card element:`, {
            target: e.target.tagName,
            className: e.target.className,
            closest: e.target.closest ? e.target.closest('*[class*="kanban"], *[class*="issue"], *[class*="card"], *[class*="item"]') : null
          });
        }
      }, { capture: true, passive: true });
    });
    
    // react-beautiful-dnd用の追加監視
    this.setupReactBeautifulDndDetection();
    
    // DOM変更監視を強化
    this.setupAdvancedMutationObserver();
  }
  
  setupReactBeautifulDndDetection() {
    console.log('[Backlog Tracker V2] Setting up react-beautiful-dnd detection');
    
    // react-beautiful-dndの状態変更を監視
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        // data-react-beautiful-dnd-* 属性の変更を監視
        if (mutation.type === 'attributes' && 
            mutation.attributeName && 
            mutation.attributeName.includes('data-react-beautiful-dnd')) {
          
          console.log('[Backlog Tracker V2] react-beautiful-dnd attribute change:', {
            attributeName: mutation.attributeName,
            oldValue: mutation.oldValue,
            newValue: mutation.target.getAttribute(mutation.attributeName),
            element: mutation.target
          });
          
          // ドラッグ操作の検出
          if (mutation.attributeName === 'data-react-beautiful-dnd-draggable' ||
              mutation.attributeName === 'data-react-beautiful-dnd-drag-handle') {
            this.handleReactDndStateChange(mutation.target, mutation.attributeName, mutation.oldValue);
          }
        }
        
        // カードの位置変更を検出
        if (mutation.type === 'childList') {
          const cardMoved = [...mutation.addedNodes, ...mutation.removedNodes].some(node => 
            node.nodeType === 1 && 
            (node.classList?.contains('card') || 
             node.querySelector?.('.card') ||
             node.getAttribute?.('data-react-beautiful-dnd-draggable'))
          );
          
          if (cardMoved) {
            console.log('[Backlog Tracker V2] Card movement detected via DOM change');
            setTimeout(() => this.detectStatusChangeFromDOM(), 200);
          }
        }
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        'data-react-beautiful-dnd-draggable',
        'data-react-beautiful-dnd-drag-handle',
        'data-react-beautiful-dnd-droppable'
      ]
    });
  }
  
  setupAdvancedMutationObserver() {
    // 既存のMutationObserverを拡張
    console.log('[Backlog Tracker V2] Setting up advanced mutation observer');
    
    // 全体的なDOM変更を監視
    const globalObserver = new MutationObserver((mutations) => {
      let hasSignificantChange = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          // カード関連の要素の変更を検出
          const relevantChange = [...mutation.addedNodes, ...mutation.removedNodes].some(node => 
            node.nodeType === 1 && (
              node.classList?.contains('card') ||
              node.querySelector?.('.card') ||
              node.closest?('.card') ||
              node.getAttribute?.('data-react-beautiful-dnd-draggable')
            )
          );
          
          if (relevantChange) {
            hasSignificantChange = true;
            console.log('[Backlog Tracker V2] Significant DOM change detected:', {
              addedNodes: mutation.addedNodes.length,
              removedNodes: mutation.removedNodes.length,
              target: mutation.target
            });
          }
        }
      });
      
      if (hasSignificantChange && this.draggedCardInfo) {
        console.log('[Backlog Tracker V2] DOM change detected during drag operation');
        setTimeout(() => this.detectStatusChangeFromDOM(), 300);
      }
    });
    
    globalObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 定期的なフォールバックチェック
    setInterval(() => {
      if (this.draggedCardInfo && Date.now() - this.dragStartTime > 5000) {
        console.log('[Backlog Tracker V2] Periodic fallback check - clearing stale drag info');
        this.draggedCardInfo = null;
      }
    }, 3000);
  }
  
  handleReactDndStateChange(element, attributeName, oldValue) {
    console.log('[Backlog Tracker V2] React DnD state change:', {
      element: element,
      attribute: attributeName,
      oldValue: oldValue,
      newValue: element.getAttribute(attributeName)
    });
    
    const cardInfo = this.extractCardInfoFromDOM(element);
    if (cardInfo) {
      // ドラッグ開始/終了の検出
      this.draggedCardInfo = cardInfo;
      console.log('[Backlog Tracker V2] Card info extracted from React DnD change:', cardInfo);
      
      // 少し遅延してステータス変更を検出
      setTimeout(() => this.detectStatusChangeFromDOM(), 500);
      setTimeout(() => this.detectStatusChangeFromDOM(), 1500);
    }
  }
  
  detectStatusChangeFromDOM() {
    if (!this.draggedCardInfo) return;
    
    console.log('[Backlog Tracker V2] Detecting status change from DOM for:', this.draggedCardInfo);
    
    // 現在のカードの位置を検索
    const allCards = document.querySelectorAll('*[class*="card"][data-react-beautiful-dnd-draggable]');
    console.log(`[Backlog Tracker V2] Found ${allCards.length} cards in DOM`);
    
    for (const card of allCards) {
      const cardInfo = this.extractCardInfoFromDOM(card);
      if (cardInfo && (cardInfo.title === this.draggedCardInfo.title || 
                      cardInfo.issueKey === this.draggedCardInfo.issueKey)) {
        
        const status = this.getCardStatusFromDOM(card);
        console.log(`[Backlog Tracker V2] Found moved card "${cardInfo.title}" in status: "${status}"`);
        
        if (status) {
          cardInfo.status = status;
          this.sendStatusChange(cardInfo);
          this.draggedCardInfo = null; // 処理完了
          return;
        }
      }
    }
    
    console.log('[Backlog Tracker V2] Could not find moved card in DOM');
  }

  isBacklogCard(element) {
    // Backlog のカード要素を判定（より柔軟なセレクタ）
    const selectors = [
      '.issues-kanban-issue',
      '.kanban-card', 
      '[data-issue-key]', 
      '.issue-card',
      '*[class*="kanban-issue"]',
      '*[class*="issue-item"]',
      '*[class*="card"]',
      '*[draggable="true"]'
    ];
    
    for (const selector of selectors) {
      const found = element.closest(selector);
      if (found) {
        console.log(`[Backlog Tracker V2] Found card with selector: ${selector}`, found);
        return found;
      }
    }
    
    return null;
  }

  handleCardEvent(eventType, e) {
    const cardElement = this.isBacklogCard(e.target);
    if (!cardElement) return;
    
    console.log('[Backlog Tracker V2] Card event detected:', {
      eventType: eventType,
      cardElement: !!cardElement,
      targetClassName: e.target.className
    });
    
    if (eventType === 'mousedown') {
      // react-beautiful-dndではmousedownでドラッグ開始
      this.draggedCardInfo = this.extractCardInfoFromDOM(cardElement);
      this.dragStartTime = Date.now();
      console.log('[Backlog Tracker V2] Mouse down on card (potential drag start):', this.draggedCardInfo);
      
      // マウス移動を監視してドラッグ意図を検出
      this.setupMouseDragDetection(e);
    }
    
    if (eventType === 'mouseup') {
      if (this.draggedCardInfo && Date.now() - this.dragStartTime > 100) {
        console.log('[Backlog Tracker V2] Mouse up after potential drag, checking for status change...');
        
        // 複数のタイミングでチェック
        setTimeout(() => this.detectStatusChangeFromDOM(), 100);
        setTimeout(() => this.detectStatusChangeFromDOM(), 500);
        setTimeout(() => this.detectStatusChangeFromDOM(), 1000);
        setTimeout(() => this.detectStatusChangeFromDOM(), 2000);
      }
    }
    
    if (eventType === 'dragstart') {
      this.draggedCardInfo = this.extractCardInfoFromDOM(cardElement);
      console.log('[Backlog Tracker V2] Drag started (fallback):', this.draggedCardInfo);
    }
    
    if (eventType === 'dragend' || eventType === 'drop') {
      if (this.draggedCardInfo) {
        console.log('[Backlog Tracker V2] Drag ended (fallback), waiting for API response...');
        
        // API レスポンスを少し待つ
        setTimeout(() => {
          if (this.draggedCardInfo) {
            console.log('[Backlog Tracker V2] No API response received, performing DOM fallback');
            this.performDOMFallback();
          }
        }, 2000);
      }
    }
  }
  
  setupMouseDragDetection(initialEvent) {
    console.log('[Backlog Tracker V2] Setting up mouse drag detection');
    
    let hasMoved = false;
    const startX = initialEvent.clientX;
    const startY = initialEvent.clientY;
    
    const mouseMoveHandler = (e) => {
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      
      if (deltaX > 5 || deltaY > 5) {
        hasMoved = true;
        console.log('[Backlog Tracker V2] Mouse movement detected, likely a drag operation');
      }
    };
    
    const mouseUpHandler = (e) => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      
      if (hasMoved && this.draggedCardInfo) {
        console.log('[Backlog Tracker V2] Drag operation completed via mouse tracking');
        
        // ドラッグ完了として処理
        setTimeout(() => this.detectStatusChangeFromDOM(), 200);
        setTimeout(() => this.detectStatusChangeFromDOM(), 800);
        setTimeout(() => this.detectStatusChangeFromDOM(), 1500);
      } else if (this.draggedCardInfo) {
        console.log('[Backlog Tracker V2] Mouse up without significant movement, clearing drag info');
        this.draggedCardInfo = null;
      }
    };
    
    document.addEventListener('mousemove', mouseMoveHandler, { passive: true });
    document.addEventListener('mouseup', mouseUpHandler, { passive: true });
  }

  extractCardInfoFromDOM(cardElement) {
    if (!cardElement) return null;
    
    console.log('[Backlog Tracker V2] Extracting card info from element:', cardElement);
    
    // より広範囲の要素検索
    const selectors = {
      issueKey: [
        '[data-issue-key]',
        '.issue-key', 
        '.ticket-key',
        '*[class*="issue-key"]',
        '*[class*="key"]'
      ],
      title: [
        '.issue-title', 
        '.card-title', 
        '.summary',
        '*[class*="title"]',
        '*[class*="summary"]',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'a', 'span', 'div'
      ]
    };
    
    let issueKey = null;
    let title = null;
    
    // Issue Key 検索
    for (const selector of selectors.issueKey) {
      const element = cardElement.querySelector(selector);
      if (element) {
        issueKey = element.textContent?.trim() || element.getAttribute('data-issue-key');
        if (issueKey) {
          console.log(`[Backlog Tracker V2] Found issue key with selector "${selector}": "${issueKey}"`);
          break;
        }
      }
    }
    
    // Title 検索
    for (const selector of selectors.title) {
      const element = cardElement.querySelector(selector);
      if (element) {
        const text = element.textContent?.trim();
        if (text && text.length > 3 && text.length < 200) { // 適切な長さのテキスト
          title = text;
          console.log(`[Backlog Tracker V2] Found title with selector "${selector}": "${title}"`);
          break;
        }
      }
    }
    
    // フォールバック: カード全体のテキスト
    if (!title) {
      const allText = cardElement.textContent?.trim();
      if (allText && allText.length > 3 && allText.length < 200) {
        title = allText.split('\n')[0]; // 最初の行を使用
        console.log(`[Backlog Tracker V2] Using fallback title: "${title}"`);
      }
    }
    
    if (!issueKey && !title) {
      console.log('[Backlog Tracker V2] No issue key or title found');
      return null;
    }
    
    const cardInfo = {
      issueKey: issueKey || '',
      title: title || 'Untitled',
      id: this.generateTaskId(issueKey, null)
    };
    
    console.log('[Backlog Tracker V2] Extracted card info:', cardInfo);
    return cardInfo;
  }

  performDOMFallback() {
    if (!this.draggedCardInfo) return;
    
    console.log('[Backlog Tracker V2] Performing DOM fallback check');
    
    // 最小限のDOM検索でカードの現在のステータスを特定
    const { issueKey, title } = this.draggedCardInfo;
    
    // カードを再検索
    const allCards = document.querySelectorAll('.issues-kanban-issue, .kanban-card, [data-issue-key], .issue-card');
    
    for (const card of allCards) {
      const cardIssueKey = card.querySelector('[data-issue-key], .issue-key, .ticket-key')?.textContent?.trim() ||
                          card.querySelector('[data-issue-key]')?.getAttribute('data-issue-key');
      const cardTitle = card.querySelector('.issue-title, .card-title, .summary')?.textContent?.trim();
      
      if ((cardIssueKey === issueKey) || (cardTitle === title)) {
        const status = this.getCardStatusFromDOM(card);
        if (status) {
          const taskInfo = {
            id: this.generateTaskId(cardIssueKey || issueKey, null),
            title: cardTitle || title,
            status: status,
            issueKey: cardIssueKey || issueKey,
            projectName: this.getProjectName()
          };
          
          console.log('[Backlog Tracker V2] DOM fallback detected status change:', taskInfo);
          this.sendStatusChange(taskInfo);
          break;
        }
      }
    }
    
    this.draggedCardInfo = null;
  }

  getCardStatusFromDOM(cardElement) {
    console.log('[Backlog Tracker V2] Getting status for card:', cardElement);
    
    // カードが属するステータス列を特定
    let current = cardElement;
    let depth = 0;
    
    while (current && depth < 15) {
      // より広範囲のヘッダー検索
      const headerSelectors = [
        '.status-header', 
        '.column-header', 
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        '*[class*="header"]',
        '*[class*="title"]',
        '*[class*="status"]',
        '*[class*="column"]'
      ];
      
      for (const selector of headerSelectors) {
        const statusHeader = current.querySelector(selector) ||
                            current.parentElement?.querySelector(selector);
        
        if (statusHeader) {
          const statusText = statusHeader.textContent?.trim();
          if (statusText && statusText.length > 0 && statusText.length < 100) {
            console.log(`[Backlog Tracker V2] Found status with selector "${selector}": "${statusText}"`);
            return statusText;
          }
        }
      }
      
      // data属性もチェック
      const dataStatus = current.getAttribute('data-status') || 
                        current.getAttribute('data-column') ||
                        current.getAttribute('data-droppable-id');
      
      if (dataStatus) {
        console.log(`[Backlog Tracker V2] Found status from data attribute: "${dataStatus}"`);
        return dataStatus;
      }
      
      // 上位要素をチェック
      current = current.parentElement;
      depth++;
    }
    
    console.log('[Backlog Tracker V2] No status found for card');
    return null;
  }

  setupUrlMonitoring() {
    // URL変更を監視（Backlog SPA対応）
    let lastUrl = window.location.href;
    
    const checkUrlChange = () => {
      if (lastUrl !== window.location.href) {
        lastUrl = window.location.href;
        console.log('[Backlog Tracker V2] URL change detected:', lastUrl);
        
        // カンバンボードページの場合のみ処理
        if (this.isKanbanPage()) {
          this.detectCurrentTaskFromPage();
        }
      }
    };
    
    // popstate イベント（ブラウザの戻る/進む）
    window.addEventListener('popstate', checkUrlChange);
    
    // pushState/replaceState の監視
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      setTimeout(checkUrlChange, 100);
    };
    
    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);
      setTimeout(checkUrlChange, 100);
    };
  }

  isKanbanPage() {
    return window.location.href.includes('.backlog.') && 
           (window.location.href.includes('/projects/') || 
            window.location.href.includes('/boards') || 
            window.location.href.includes('/board/') ||
            window.location.href.includes('/kanban'));
  }

  detectCurrentTaskFromPage() {
    // URL変更時のみ、現在表示されているタスクを検出
    setTimeout(() => {
      const focusedCard = document.querySelector('.focused, .selected, [aria-selected="true"]');
      if (focusedCard) {
        const cardInfo = this.extractCardInfoFromDOM(focusedCard);
        if (cardInfo) {
          const status = this.getCardStatusFromDOM(focusedCard);
          if (status) {
            cardInfo.status = status;
            console.log('[Backlog Tracker V2] Current task detected from page:', cardInfo);
            this.currentTaskId = cardInfo.id;
            this.currentStatus = cardInfo.status;
          }
        }
      }
    }, 500);
  }

  sendStatusChange(taskInfo) {
    const changeData = {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: this.currentStatus,
      service: 'backlog',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName || this.getProjectName(),
      issueKey: taskInfo.issueKey
    };
    
    console.log('[Backlog Tracker V2] Sending status change:', changeData);
    console.log('[Backlog Tracker V2] Previous status:', this.currentStatus);
    console.log('[Backlog Tracker V2] Previous task ID:', this.currentTaskId);
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        console.log('[Backlog Tracker V2] Background response received:', response);
        
        if (response && response.success) {
          console.log('[Backlog Tracker V2] Status change processed successfully');
          this.currentTaskId = taskInfo.id;
          this.currentStatus = taskInfo.status;
          
          console.log('[Backlog Tracker V2] Updated current state:', {
            taskId: this.currentTaskId,
            status: this.currentStatus
          });
        } else {
          console.error('[Backlog Tracker V2] Failed to process status change:', response);
        }
      });
    } catch (error) {
      console.error('[Backlog Tracker V2] Error sending status change:', {
        error: error.message,
        stack: error.stack,
        changeData: changeData
      });
    }
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

// Backlog ページでのみ初期化
console.log('[Backlog Tracker V2] Script loaded, checking URL:', window.location.href);
console.log('[Backlog Tracker V2] URL checks:', {
  includesBacklog: window.location.href.includes('.backlog.'),
  includesProjects: window.location.href.includes('/projects/'),
  includesBoards: window.location.href.includes('/boards/'),
  includesBoard: window.location.href.includes('/board/')
});

if (window.location.href.includes('.backlog.') && 
    (window.location.href.includes('/projects/') || 
     window.location.href.includes('/boards/') || 
     window.location.href.includes('/board/'))) {
  
  console.log('[Backlog Tracker V2] Initializing on Backlog page');
  console.log('[Backlog Tracker V2] Document ready state:', document.readyState);
  
  if (document.readyState === 'loading') {
    console.log('[Backlog Tracker V2] Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('[Backlog Tracker V2] DOMContentLoaded fired, creating tracker');
      window.backlogTrackerV2 = new BacklogTaskTrackerV2();
    });
  } else {
    console.log('[Backlog Tracker V2] Document already ready, creating tracker immediately');
    window.backlogTrackerV2 = new BacklogTaskTrackerV2();
  }
  
  // ハートビート
  setInterval(() => {
    if (window.backlogTrackerV2) {
      window.backlogTrackerV2.sendHeartbeat();
    }
  }, 60000);
} else {
  console.log('[Backlog Tracker V2] Not a Backlog kanban page, skipping initialization');
}