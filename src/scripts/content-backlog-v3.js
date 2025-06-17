class BacklogTaskTrackerV3 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.draggedCardInfo = null;
    this.dragStartTime = null;
    
    // より強力なネットワーク監視
    this.setupAdvancedNetworkInterception();
    this.init();
  }

  init() {
    console.log('[Backlog Tracker V3] Initializing enhanced network tracking');
    
    // 1. Performance API監視
    this.setupPerformanceMonitoring();
    
    // 2. WebSocket監視
    this.setupWebSocketMonitoring();
    
    // 3. ServiceWorker監視
    this.setupServiceWorkerMonitoring();
    
    // 4. イベント監視
    this.setupEventDelegation();
    
    console.log('[Backlog Tracker V3] Initialization complete');
  }

  setupAdvancedNetworkInterception() {
    console.log('[Backlog Tracker V3] Setting up advanced network interception');
    
    // 1. 元のメソッドを保存
    this.originalFetch = window.fetch;
    this.originalXMLHttpRequest = window.XMLHttpRequest;
    this.originalSendBeacon = navigator.sendBeacon;
    
    // 2. すべてのネットワーク呼び出しをインターセプト
    this.interceptAllNetworkCalls();
    
    // 3. サードパーティライブラリの監視
    this.interceptThirdPartyLibraries();
  }

  interceptAllNetworkCalls() {
    const tracker = this;
    
    // 元のfetchが正しく保存されているか確認
    console.log('[Backlog Tracker V3] 🔧 Original fetch:', typeof this.originalFetch);
    
    // Fetch API
    window.fetch = async function(...args) {
      const url = args[0];
      const options = args[1] || {};
      
      // 🔥 必ずログ出力（絶対に表示される）
      console.log('[Backlog Tracker V3] 🌐🔥 FETCH INTERCEPTED:', {
        url: url,
        method: options.method || 'GET',
        timestamp: new Date().toISOString(),
        caller: 'window.fetch'
      });
      
      // Backlog関連のリクエストは特別にマーク
      if (tracker.isBacklogAPI(url)) {
        console.log('[Backlog Tracker V3] 🎯🌐🔥 BACKLOG FETCH DETECTED!', url);
      }
      
      try {
        const response = await tracker.originalFetch.apply(this, args);
        
        console.log('[Backlog Tracker V3] 📥 Fetch response received:', {
          url: url,
          status: response.status,
          ok: response.ok
        });
        
        // レスポンスを非同期で処理
        if (tracker.isBacklogAPI(url)) {
          console.log('[Backlog Tracker V3] 🔄 Processing Backlog response...');
          tracker.processNetworkResponse(url, options, response.clone());
        }
        
        return response;
      } catch (error) {
        console.error('[Backlog Tracker V3] Fetch error:', error);
        throw error;
      }
    };

    // XMLHttpRequest
    class InterceptedXMLHttpRequest extends this.originalXMLHttpRequest {
      open(method, url, ...args) {
        this._intercepted = {
          method: method,
          url: url,
          startTime: Date.now()
        };
        
        console.log('[Backlog Tracker V3] 📡 XHR Open:', {
          method: method,
          url: url,
          timestamp: new Date().toISOString()
        });
        
        return super.open(method, url, ...args);
      }
      
      send(data) {
        if (this._intercepted) {
          this._intercepted.data = data;
          console.log('[Backlog Tracker V3] 📤 XHR Send:', {
            url: this._intercepted.url,
            method: this._intercepted.method,
            hasData: !!data
          });
        }
        
        this.addEventListener('load', () => {
          if (this._intercepted) {
            console.log('[Backlog Tracker V3] 📥 XHR Response:', {
              url: this._intercepted.url,
              status: this.status,
              duration: Date.now() - this._intercepted.startTime,
              responseType: this.responseType,
              responseLength: this.responseText ? this.responseText.length : 0
            });
            
            tracker.processXHRResponse(this);
          }
        });
        
        return super.send(data);
      }
    }
    
    window.XMLHttpRequest = InterceptedXMLHttpRequest;

    // sendBeacon
    if (navigator.sendBeacon) {
      navigator.sendBeacon = function(url, data) {
        console.log('[Backlog Tracker V3] 🚨 SendBeacon:', {
          url: url,
          data: data,
          timestamp: new Date().toISOString()
        });
        
        return tracker.originalSendBeacon.call(this, url, data);
      };
    }
  }

  interceptThirdPartyLibraries() {
    // axios監視
    if (window.axios) {
      console.log('[Backlog Tracker V3] Intercepting axios');
      
      window.axios.interceptors.request.use(
        (config) => {
          console.log('[Backlog Tracker V3] 🔧 Axios Request:', config);
          return config;
        },
        (error) => {
          console.error('[Backlog Tracker V3] Axios Request Error:', error);
          return Promise.reject(error);
        }
      );

      window.axios.interceptors.response.use(
        (response) => {
          console.log('[Backlog Tracker V3] 📬 Axios Response:', response);
          this.processAxiosResponse(response);
          return response;
        },
        (error) => {
          console.error('[Backlog Tracker V3] Axios Response Error:', error);
          return Promise.reject(error);
        }
      );
    }

    // jQuery監視
    if (window.$ && window.$.ajaxSetup) {
      console.log('[Backlog Tracker V3] Intercepting jQuery AJAX');
      
      const originalAjax = window.$.ajax;
      window.$.ajax = function(options) {
        console.log('[Backlog Tracker V3] 💰 jQuery AJAX:', options);
        
        const originalSuccess = options.success;
        const originalError = options.error;
        
        options.success = function(data, textStatus, jqXHR) {
          console.log('[Backlog Tracker V3] 📫 jQuery Success:', {
            url: options.url,
            data: data,
            status: textStatus
          });
          
          tracker.processJQueryResponse(options, data, jqXHR);
          
          if (originalSuccess) {
            return originalSuccess.apply(this, arguments);
          }
        };
        
        options.error = function(jqXHR, textStatus, errorThrown) {
          console.error('[Backlog Tracker V3] jQuery Error:', {
            url: options.url,
            status: textStatus,
            error: errorThrown
          });
          
          if (originalError) {
            return originalError.apply(this, arguments);
          }
        };
        
        return originalAjax.call(this, options);
      };
    }
  }

  setupPerformanceMonitoring() {
    console.log('[Backlog Tracker V3] Setting up Performance API monitoring');
    
    // Performance Observer
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource' && entry.name.includes('.backlog.')) {
            console.log('[Backlog Tracker V3] 🎯 Performance Entry:', {
              name: entry.name,
              type: entry.initiatorType,
              duration: entry.duration,
              transferSize: entry.transferSize
            });
            
            this.analyzePerformanceEntry(entry);
          }
        });
      });
      
      try {
        observer.observe({ entryTypes: ['resource'] });
      } catch (e) {
        console.log('[Backlog Tracker V3] Performance Observer not supported');
      }
    }

    // 定期的にパフォーマンスエントリをチェック
    setInterval(() => {
      const entries = performance.getEntriesByType('resource');
      const recentEntries = entries.filter(entry => 
        entry.name.includes('.backlog.') && 
        Date.now() - entry.startTime < 5000
      );
      
      if (recentEntries.length > 0) {
        console.log('[Backlog Tracker V3] 📊 Recent Backlog requests:', recentEntries);
        recentEntries.forEach(entry => this.analyzePerformanceEntry(entry));
      }
    }, 2000);
  }

  setupWebSocketMonitoring() {
    console.log('[Backlog Tracker V3] Setting up WebSocket monitoring');
    
    const originalWebSocket = window.WebSocket;
    
    window.WebSocket = function(url, protocols) {
      console.log('[Backlog Tracker V3] 🔌 WebSocket connection:', url);
      
      const ws = new originalWebSocket(url, protocols);
      
      ws.addEventListener('message', (event) => {
        if (url.includes('.backlog.')) {
          console.log('[Backlog Tracker V3] 📨 WebSocket message:', {
            url: url,
            data: event.data,
            timestamp: new Date().toISOString()
          });
          
          tracker.processWebSocketMessage(event.data, url);
        }
      });
      
      return ws;
    };
    
    window.WebSocket.prototype = originalWebSocket.prototype;
  }

  setupServiceWorkerMonitoring() {
    if ('serviceWorker' in navigator) {
      console.log('[Backlog Tracker V3] Setting up ServiceWorker monitoring');
      
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('[Backlog Tracker V3] 👷 ServiceWorker message:', event.data);
        this.processServiceWorkerMessage(event.data);
      });
    }
  }

  setupEventDelegation() {
    console.log('[Backlog Tracker V3] Setting up event delegation');
    
    // マウスイベントベースのドラッグ検出
    let dragState = null;
    
    document.addEventListener('mousedown', (e) => {
      const card = this.findCardElement(e.target);
      if (card) {
        dragState = {
          card: card,
          startX: e.clientX,
          startY: e.clientY,
          startTime: Date.now(),
          cardInfo: this.extractCardInfo(card)
        };
        
        console.log('[Backlog Tracker V3] 🖱️ Potential drag start:', dragState.cardInfo);
      }
    }, true);
    
    document.addEventListener('mousemove', (e) => {
      if (dragState) {
        const deltaX = Math.abs(e.clientX - dragState.startX);
        const deltaY = Math.abs(e.clientY - dragState.startY);
        
        if (deltaX > 10 || deltaY > 10) {
          if (!dragState.isDragging) {
            dragState.isDragging = true;
            this.draggedCardInfo = dragState.cardInfo;
            console.log('[Backlog Tracker V3] 🚀 Drag confirmed:', this.draggedCardInfo);
          }
        }
      }
    }, true);
    
    document.addEventListener('mouseup', (e) => {
      if (dragState && dragState.isDragging) {
        console.log('[Backlog Tracker V3] 🎯 Drag completed, detecting status change...');
        
        // ドラッグ開始時のステータスを記録
        const originalStatus = this.getCardStatus(dragState.card);
        console.log('[Backlog Tracker V3] 📍 Original status before drag:', originalStatus);
        
        // より長い遅延で複数回チェック（DOM更新を待つ）
        setTimeout(() => this.detectStatusChange(originalStatus), 300);
        setTimeout(() => this.detectStatusChange(originalStatus), 800);
        setTimeout(() => this.detectStatusChange(originalStatus), 1500);
        setTimeout(() => this.detectStatusChange(originalStatus), 3000);
      }
      
      dragState = null;
    }, true);
  }

  // ネットワークレスポンス処理メソッド
  async processNetworkResponse(url, options, response) {
    try {
      if (this.isBacklogAPI(url)) {
        // レスポンスのクローンを作成して内容を読み取り
        const responseClone = response.clone();
        const text = await responseClone.text();
        
        console.log('[Backlog Tracker V3] 🎯 Backlog API Raw Response:', {
          url: url,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          bodyLength: text.length,
          bodyPreview: text.substring(0, 500)
        });
        
        try {
          const data = JSON.parse(text);
          console.log('[Backlog Tracker V3] 🎯 Backlog API Parsed Data:', data);
          this.processBacklogAPIData(data, url);
        } catch (parseError) {
          console.log('[Backlog Tracker V3] Response is not JSON:', text);
        }
      }
    } catch (error) {
      console.error('[Backlog Tracker V3] Error processing response:', error);
    }
  }

  processXHRResponse(xhr) {
    if (this.isBacklogAPI(xhr._intercepted?.url) && xhr.responseText) {
      try {
        const data = JSON.parse(xhr.responseText);
        console.log('[Backlog Tracker V3] 🎯 Backlog XHR Data:', data);
        this.processBacklogAPIData(data, xhr._intercepted.url);
      } catch (error) {
        console.log('[Backlog Tracker V3] XHR parse error:', error.message);
      }
    }
  }

  processAxiosResponse(response) {
    if (this.isBacklogAPI(response.config?.url)) {
      console.log('[Backlog Tracker V3] 🎯 Backlog Axios Data:', response.data);
      this.processBacklogAPIData(response.data, response.config.url);
    }
  }

  processJQueryResponse(options, data, jqXHR) {
    if (this.isBacklogAPI(options.url)) {
      console.log('[Backlog Tracker V3] 🎯 Backlog jQuery Data:', data);
      this.processBacklogAPIData(data, options.url);
    }
  }

  analyzePerformanceEntry(entry) {
    console.log('[Backlog Tracker V3] Analyzing performance entry:', entry.name);
    // Performance API からは詳細なレスポンスデータは取得できないが、
    // タイミング情報は有用
  }

  processWebSocketMessage(data, url) {
    try {
      const parsed = JSON.parse(data);
      console.log('[Backlog Tracker V3] 🎯 Backlog WebSocket Data:', parsed);
      this.processBacklogAPIData(parsed, url);
    } catch (error) {
      console.log('[Backlog Tracker V3] WebSocket non-JSON data:', data);
    }
  }

  processServiceWorkerMessage(data) {
    console.log('[Backlog Tracker V3] Processing ServiceWorker message:', data);
  }

  processBacklogAPIData(data, url) {
    console.log('[Backlog Tracker V3] 🔍 Processing Backlog data:', data);
    
    // updateCard検出
    if (data.updateCard) {
      this.handleCardUpdate(data.updateCard);
    }
    
    // その他のパターン
    if (data.data && data.data.updateCard) {
      this.handleCardUpdate(data.data.updateCard);
    }
    
    // 配列の場合
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.updateCard) {
          this.handleCardUpdate(item.updateCard);
        }
      });
    }
  }

  async handleCardUpdate(updateCard) {
    console.log('[Backlog Tracker V3] ✅ Card update detected:', updateCard);
    
    if (updateCard.issue) {
      const taskInfo = {
        id: this.generateTaskId(updateCard.issue.issueKey, updateCard.issue.id),
        title: updateCard.issue.summary,
        status: updateCard.issue.status.name,
        issueKey: updateCard.issue.issueKey,
        issueId: updateCard.issue.id,
        projectId: updateCard.issue.projectId,
        projectName: this.getProjectName(),
        spaceId: this.getSpaceId()
      };
      
      console.log('[Backlog Tracker V3] ✅ Extracted task info from updateCard:', taskInfo);
      
      // V4のタスクマッチング機能を追加
      await this.checkAndProcessTaskChange(taskInfo);
    }
  }
  
  async checkAndProcessTaskChange(taskInfo) {
    console.log('[Backlog Tracker V3] 🔍 Checking against active timers...');
    
    try {
      // Background Scriptから現在のアクティブタイマーを取得
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TIMERS' }, resolve);
      });
      
      if (response && response.activeTimers) {
        console.log('[Backlog Tracker V3] 📊 Active timers received:', response.activeTimers);
        
        // アクティブタイマーの中から一致するタスクを検索
        const matchingTimer = this.findMatchingTimer(taskInfo, response.activeTimers);
        
        if (matchingTimer) {
          console.log('[Backlog Tracker V3] ✅ Found matching active timer:', matchingTimer);
          await this.processMatchingTaskChange(taskInfo, matchingTimer);
        } else {
          console.log('[Backlog Tracker V3] 📝 No matching active timer found, treating as new status change');
          this.sendStatusChange(taskInfo);
        }
      } else {
        console.log('[Backlog Tracker V3] ⚠️ No active timers or failed to get response');
        this.sendStatusChange(taskInfo);
      }
    } catch (error) {
      console.error('[Backlog Tracker V3] ❌ Error checking active timers:', error);
      // エラーの場合は通常の処理にフォールバック
      this.sendStatusChange(taskInfo);
    }
  }
  
  findMatchingTimer(taskInfo, activeTimers) {
    console.log('[Backlog Tracker V3] 🔍 Searching for matching timer...');
    console.log('[Backlog Tracker V3] 📋 Task to match:', {
      title: taskInfo.title,
      issueKey: taskInfo.issueKey,
      spaceId: taskInfo.spaceId
    });
    
    for (const [timerId, timerData] of Object.entries(activeTimers)) {
      console.log(`[Backlog Tracker V3] 🔍 Checking timer ${timerId}:`, {
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
      
      console.log(`[Backlog Tracker V3] 🎯 Match analysis for ${timerId}:`, {
        titleMatch: titleMatch,
        issueKeyMatch: issueKeyMatch,
        spaceMatch: spaceMatch
      });
      
      // Issue Keyが一致すれば確実に同じタスク
      if (issueKeyMatch && spaceMatch) {
        console.log('[Backlog Tracker V3] ✅ Exact match found by issueKey and spaceId');
        return { timerId, timerData };
      }
      
      // Issue Keyがない場合はタイトルとスペースIDで照合
      if (!taskInfo.issueKey && !timerData.issueKey && titleMatch && spaceMatch) {
        console.log('[Backlog Tracker V3] ✅ Match found by title and spaceId');
        return { timerId, timerData };
      }
    }
    
    console.log('[Backlog Tracker V3] ❌ No matching timer found');
    return null;
  }
  
  async processMatchingTaskChange(taskInfo, matchingTimer) {
    console.log('[Backlog Tracker V3] 🔄 Processing matched task change...');
    
    const { timerId, timerData } = matchingTimer;
    const newStatus = taskInfo.status;
    
    console.log('[Backlog Tracker V3] 📊 Task change details:', {
      timerId: timerId,
      currentTask: timerData.taskTitle,
      newStatus: newStatus,
      oldStatus: 'Unknown (was being tracked)'
    });
    
    // 設定を取得して計測継続すべきかチェック
    const shouldContinueTracking = await this.shouldContinueTracking(newStatus);
    
    if (shouldContinueTracking) {
      console.log('[Backlog Tracker V3] ▶️ Status change within tracking statuses, continuing timer');
      // ステータス更新のみ（タイマー継続）
      this.sendStatusUpdate(taskInfo, timerData);
    } else {
      console.log('[Backlog Tracker V3] ⏹️ Status change to non-tracking status, stopping timer');
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
          console.log('[Backlog Tracker V3] 🎯 Tracking check:', {
            status: status,
            trackingStatuses: backlogSettings.start,
            shouldTrack: shouldTrack
          });
          return shouldTrack;
        }
      }
    } catch (error) {
      console.error('[Backlog Tracker V3] Error getting settings:', error);
    }
    
    // フォールバック: 一般的な作業中ステータス
    return ['処理中', 'now', 'In Progress', '作業中'].includes(status);
  }
  
  sendStatusUpdate(taskInfo, timerData) {
    console.log('[Backlog Tracker V3] 📤 Sending status update (timer continues):', taskInfo);
    
    // ここでは実際にはタイマーを停止せず、状態更新のみ
    this.sendStatusChange(taskInfo, 'UPDATE');
  }
  
  sendTimerStop(taskInfo, timerData) {
    console.log('[Backlog Tracker V3] 📤 Sending timer stop request:', taskInfo);
    
    // 明示的にタイマー停止を指示
    this.sendStatusChange(taskInfo, 'STOP');
  }
  
  getSpaceId() {
    // URLからBacklogスペースIDを抽出
    // 例: https://way-space.backlog.com/board/TEST → "way-space"
    const urlMatch = window.location.href.match(/https?:\/\/([^.]+)\.backlog\.(com|jp)/);
    const spaceId = urlMatch ? urlMatch[1] : 'unknown-space';
    
    console.log('[Backlog Tracker V3] 🆔 Extracted space ID:', spaceId);
    return spaceId;
  }

  isBacklogAPI(url) {
    if (!url) return false;
    const isBacklog = url.includes('.backlog.') && 
           (url.includes('/api/') || url.includes('/board-api/') || url.includes('kanban'));
    
    if (isBacklog) {
      console.log('[Backlog Tracker V3] 🎯🔥 BACKLOG API DETECTED:', url);
    }
    
    return isBacklog;
  }

  findCardElement(element) {
    return element.closest('*[class*="card"], *[data-react-beautiful-dnd-draggable]');
  }

  extractCardInfo(cardElement) {
    // カード情報抽出ロジック（簡素化）
    const title = cardElement.textContent?.trim().split('\n')[0] || 'Unknown';
    return {
      title: title,
      id: `backlog-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  detectStatusChange(originalStatus = null) {
    if (!this.draggedCardInfo) return;
    
    console.log('[Backlog Tracker V3] 🔍 Detecting status change for:', this.draggedCardInfo);
    console.log('[Backlog Tracker V3] 📍 Original status was:', originalStatus);
    
    // DOM検索でステータス変更を検出
    const allCards = document.querySelectorAll('*[class*="card"]');
    console.log(`[Backlog Tracker V3] 🔍 Searching through ${allCards.length} cards`);
    
    for (const card of allCards) {
      const cardInfo = this.extractCardInfo(card);
      if (cardInfo.title === this.draggedCardInfo.title) {
        const currentStatus = this.getCardStatus(card);
        
        console.log('[Backlog Tracker V3] 🎯 Found matching card:', {
          title: cardInfo.title,
          currentStatus: currentStatus,
          originalStatus: originalStatus,
          hasStatusChanged: currentStatus !== originalStatus
        });
        
        if (currentStatus && currentStatus !== originalStatus) {
          console.log('[Backlog Tracker V3] ✅ Status change confirmed:', {
            title: cardInfo.title,
            from: originalStatus,
            to: currentStatus
          });
          
          this.sendStatusChange({
            ...cardInfo,
            status: currentStatus,
            oldStatus: originalStatus,
            projectName: this.getProjectName()
          });
          
          this.draggedCardInfo = null;
          return;
        } else if (currentStatus === originalStatus) {
          console.log('[Backlog Tracker V3] ⏳ Status unchanged, still waiting for DOM update...');
        }
      }
    }
    
    console.log('[Backlog Tracker V3] ❌ No status change detected yet');
  }

  getCardStatus(cardElement) {
    console.log('[Backlog Tracker V3] 🔍 Getting status for card:', cardElement);
    
    let current = cardElement;
    for (let i = 0; i < 15; i++) {
      const headerSelectors = ['h1', 'h2', 'h3', 'h4', '*[class*="header"]', '*[class*="title"]'];
      
      for (const selector of headerSelectors) {
        const header = current.querySelector(selector) || 
                      current.parentElement?.querySelector(selector);
        
        if (header) {
          const rawText = header.textContent?.trim();
          if (rawText && rawText.length > 0) {
            // タスク数を除去（例: "処理中1" → "処理中"）
            const cleanStatus = this.cleanStatusText(rawText);
            console.log(`[Backlog Tracker V3] 📋 Status found: "${rawText}" → cleaned: "${cleanStatus}"`);
            return cleanStatus;
          }
        }
      }
      
      // data属性もチェック
      const dataStatus = current.getAttribute('data-status') || 
                        current.getAttribute('data-column') ||
                        current.getAttribute('data-droppable-id');
      
      if (dataStatus) {
        const cleanStatus = this.cleanStatusText(dataStatus);
        console.log(`[Backlog Tracker V3] 📋 Status from data attribute: "${dataStatus}" → cleaned: "${cleanStatus}"`);
        return cleanStatus;
      }
      
      current = current.parentElement;
      if (!current) break;
    }
    
    console.log('[Backlog Tracker V3] ❌ No status found for card');
    return null;
  }
  
  cleanStatusText(text) {
    if (!text) return text;
    
    // タスク数を除去（例: "処理中1" → "処理中", "完了12" → "完了"）
    // 日本語文字 + 数字のパターンを検出
    const cleaned = text.replace(/^(.+?)(\d+)$/, '$1').trim();
    
    // より具体的なパターンもチェック
    const patterns = [
      /^(.+?)\s*\(\d+\)$/, // "処理中 (1)"
      /^(.+?)\s*\[\d+\]$/, // "処理中 [1]"  
      /^(.+?)\s*\d+$/, // "処理中1"
      /^(.+?)\s*：\d+$/, // "処理中：1"
      /^(.+?)\s*:\d+$/, // "処理中:1"
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        console.log(`[Backlog Tracker V3] 🧹 Cleaned "${text}" → "${match[1]}" using pattern: ${pattern}`);
        return match[1].trim();
      }
    }
    
    console.log(`[Backlog Tracker V3] 🧹 No cleaning needed for: "${text}"`);
    return text;
  }

  generateTaskId(issueKey, issueId) {
    return issueKey ? `backlog-${issueKey}` : `backlog-${issueId || Date.now()}`;
  }

  getProjectName() {
    return window.location.pathname.split('/')[1] || 'Unknown';
  }

  sendStatusChange(taskInfo, action = null) {
    const changeData = {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: taskInfo.oldStatus || this.currentStatus,
      service: 'backlog',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName,
      issueKey: taskInfo.issueKey,
      spaceId: taskInfo.spaceId || this.getSpaceId(),
      action: action
    };
    
    console.log('[Backlog Tracker V3] 📤 Sending to background:', changeData);
    
    // 現在の状態を更新
    this.currentStatus = taskInfo.status;
    this.currentTaskId = taskInfo.id;
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        console.log('[Backlog Tracker V3] 📥 Background response:', response);
        
        if (response && response.success) {
          console.log('[Backlog Tracker V3] ✅ Status change successfully processed');
        } else {
          console.error('[Backlog Tracker V3] ❌ Background processing failed:', response);
        }
      });
    } catch (error) {
      console.error('[Backlog Tracker V3] Send error:', error);
    }
  }
}

// 初期化
if (window.location.href.includes('.backlog.')) {
  console.log('[Backlog Tracker V3] 🚀 Starting V3 tracker');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.backlogTrackerV3 = new BacklogTaskTrackerV3();
    });
  } else {
    window.backlogTrackerV3 = new BacklogTaskTrackerV3();
  }
}