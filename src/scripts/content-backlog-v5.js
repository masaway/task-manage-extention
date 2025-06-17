class BacklogTaskTrackerV5 {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    
    // webRequest API統合実装
    this.setupWebRequestListener();
    this.setupNetworkInterception();
    
    console.log('[Backlog Tracker V5] 🚀 webRequest API + fetch interception implementation initialized');
  }
  
  setupWebRequestListener() {
    console.log('[Backlog Tracker V5] 🔧 Setting up webRequest message listener');
    
    // Background scriptからのメッセージを受信
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'BACKLOG_API_REQUEST') {
        console.log('[Backlog Tracker V5] 📥 Received webRequest notification:', message.data);
        this.handleWebRequestNotification(message.data);
        sendResponse({ success: true });
      }
    });
  }
  
  async handleWebRequestNotification(requestData) {
    console.log('[Backlog Tracker V5] 🔄 Processing webRequest notification:', requestData);
    
    // webRequestで検知したが、実際のレスポンスデータは fetch interceptor で取得
    // ここでは API呼び出しが発生したことをログに記録するだけ
    console.log('[Backlog Tracker V5] 📝 Backlog API request detected, waiting for fetch interceptor...');
    
    // 実際のデータ処理は setupNetworkInterception() の fetch interceptor が行う
  }
  
  async fetchKanbanData(requestData) {
    console.log('[Backlog Tracker V5] 🔄 Fetching Kanban data from:', requestData.url);
    
    try {
      // 元のリクエストヘッダーを復元
      const headers = {};
      if (requestData.headers) {
        requestData.headers.forEach(header => {
          // Chrome拡張では設定できないヘッダーをスキップ
          const skipHeaders = ['host', 'user-agent', 'content-length', 'connection', 'origin', 'referer'];
          if (!skipHeaders.includes(header.name.toLowerCase())) {
            headers[header.name] = header.value;
          }
        });
      }
      
      // 基本的なヘッダーを追加
      headers['Accept'] = 'application/json, text/plain, */*';
      headers['Accept-Language'] = 'ja,en-US;q=0.9,en;q=0.8';
      
      console.log('[Backlog Tracker V5] 📤 Using headers:', headers);
      
      // 元のリクエストを模倣してデータを取得
      const response = await fetch(requestData.url, {
        method: requestData.method || 'GET',
        credentials: 'include',
        headers: headers,
        cache: 'no-cache'
      });
      
      console.log('[Backlog Tracker V5] 📥 Fetch response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Backlog Tracker V5] ✅ Fetched Kanban data:', data);
        
        // updateCardを検索して処理
        this.processKanbanData(data);
      } else {
        console.log('[Backlog Tracker V5] ⚠️ Fetch response not ok:', response.status, response.statusText);
        
        // エラーレスポンスの内容も確認
        try {
          const errorText = await response.text();
          console.log('[Backlog Tracker V5] 📄 Error response body:', errorText);
        } catch (e) {
          console.log('[Backlog Tracker V5] Could not read error response body');
        }
      }
    } catch (error) {
      console.error('[Backlog Tracker V5] Error fetching Kanban data:', error);
    }
  }
  
  processKanbanData(data) {
    console.log('[Backlog Tracker V5] 🔍 Processing Kanban data for updateCard...');
    
    // updateCardを再帰的に検索
    const updateCard = this.findUpdateCardInData(data);
    if (updateCard) {
      console.log('[Backlog Tracker V5] 🎯 Found updateCard in fetched data!');
      this.handleUpdateCard(updateCard);
    } else {
      console.log('[Backlog Tracker V5] ⚠️ No updateCard found in fetched data');
    }
  }
  
  findUpdateCardInData(data, path = '') {
    if (!data || typeof data !== 'object') return null;
    
    // 直接updateCardがある場合
    if (data.updateCard) {
      console.log(`[Backlog Tracker V5] ✅ Found updateCard at ${path}:`, data.updateCard);
      return data.updateCard;
    }
    
    // オブジェクトの各プロパティを検索
    for (const [key, value] of Object.entries(data)) {
      if (key === 'updateCard' && value) {
        console.log(`[Backlog Tracker V5] ✅ Found updateCard at ${path}.${key}:`, value);
        return value;
      }
      
      // 再帰的に検索
      if (typeof value === 'object' && value !== null) {
        const found = this.findUpdateCardInData(value, `${path}.${key}`);
        if (found) return found;
      }
    }
    
    // 配列の場合
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const found = this.findUpdateCardInData(data[i], `${path}[${i}]`);
        if (found) return found;
      }
    }
    
    return null;
  }
  
  debugNetworkMethods() {
    console.log('[Backlog Tracker V5] 🔍 Debugging all possible network methods...');
    
    // 即座にWebSocketとService Workerをチェック
    this.checkWebSockets();
    this.checkServiceWorkers();
    this.checkIframes();
    
    // 定期的にwindowオブジェクトをチェック
    const checkInterval = setInterval(() => {
      const methods = [];
      
      // よく使われるHTTPライブラリをチェック
      if (window.fetch !== this.originalFetch) methods.push('fetch');
      if (window.XMLHttpRequest !== this.originalXMLHttpRequest) methods.push('XMLHttpRequest');
      if (window.axios) methods.push('axios');
      if (window.$) methods.push('jQuery');
      if (window.superagent) methods.push('superagent');
      if (window.ky) methods.push('ky');
      
      // GraphQLクライアントをチェック
      if (window.Apollo) methods.push('Apollo');
      if (window.graphql) methods.push('graphql');
      if (window.relay) methods.push('relay');
      
      // カスタムHTTPクライアントの可能性
      for (const prop in window) {
        if (prop.toLowerCase().includes('http') || 
            prop.toLowerCase().includes('request') ||
            prop.toLowerCase().includes('client') ||
            prop.toLowerCase().includes('graphql') ||
            prop.toLowerCase().includes('apollo')) {
          methods.push(`custom:${prop}`);
        }
      }
      
      if (methods.length > 0) {
        console.log('[Backlog Tracker V5] 📊 Detected HTTP methods:', methods);
      }
    }, 2000);
    
    // 10秒後に停止
    setTimeout(() => clearInterval(checkInterval), 10000);
    
    // イベントリスナーでネットワーク活動を監視
    this.setupEventBasedNetworkMonitoring();
  }
  
  checkWebSockets() {
    console.log('[Backlog Tracker V5] 🔍 Checking for WebSockets...');
    
    const originalWebSocket = window.WebSocket;
    const tracker = this;
    
    window.WebSocket = function(url, protocols) {
      console.log('[Backlog Tracker V5] 🔌 WebSocket connection detected:', url);
      
      const ws = new originalWebSocket(url, protocols);
      
      ws.addEventListener('message', (event) => {
        console.log('[Backlog Tracker V5] 📨 WebSocket message:', {
          url: url,
          data: event.data?.substring(0, 200),
          timestamp: new Date().toISOString()
        });
        
        // GraphQL over WebSocketの可能性
        if (event.data && event.data.includes('updateCard')) {
          console.log('[Backlog Tracker V5] 🎯 Found updateCard in WebSocket message!');
          try {
            const data = JSON.parse(event.data);
            tracker.processWebSocketData(data);
          } catch (e) {
            console.log('[Backlog Tracker V5] WebSocket data is not JSON');
          }
        }
      });
      
      return ws;
    };
    
    window.WebSocket.prototype = originalWebSocket.prototype;
  }
  
  checkServiceWorkers() {
    console.log('[Backlog Tracker V5] 🔍 Checking for Service Workers...');
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        console.log('[Backlog Tracker V5] 👷 Found Service Workers:', registrations.length);
        registrations.forEach(reg => {
          console.log('[Backlog Tracker V5] SW scope:', reg.scope);
        });
      });
      
      navigator.serviceWorker.addEventListener('message', event => {
        console.log('[Backlog Tracker V5] 📨 Service Worker message:', event.data);
      });
    }
  }
  
  checkIframes() {
    console.log('[Backlog Tracker V5] 🔍 Checking for iframes...');
    
    const checkFrames = () => {
      const frames = document.querySelectorAll('iframe');
      console.log('[Backlog Tracker V5] 🖼️ Found iframes:', frames.length);
      
      frames.forEach((frame, index) => {
        try {
          console.log(`[Backlog Tracker V5] iframe ${index}:`, {
            src: frame.src,
            origin: frame.contentWindow?.location?.origin
          });
          
          // iframe内にもinterceptorを設定を試みる
          if (frame.contentWindow) {
            this.setupFrameInterception(frame.contentWindow, index);
          }
        } catch (e) {
          console.log(`[Backlog Tracker V5] iframe ${index} access blocked (CORS):`, e.message);
        }
      });
    };
    
    // DOM読み込み後とDOMChanges時にチェック
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkFrames);
    } else {
      checkFrames();
    }
    
    // 新しいiframeの動的追加を監視
    const observer = new MutationObserver(() => {
      checkFrames();
    });
    
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
  
  setupFrameInterception(frameWindow, frameIndex) {
    try {
      console.log(`[Backlog Tracker V5] 🖼️ Setting up interception for iframe ${frameIndex}`);
      
      const tracker = this;
      const originalFrameFetch = frameWindow.fetch;
      
      if (originalFrameFetch) {
        frameWindow.fetch = async function(...args) {
          const url = args[0];
          console.log(`[Backlog Tracker V5] 🌐 iframe ${frameIndex} fetch:`, url);
          
          const response = await originalFrameFetch.apply(this, args);
          
          if (url && url.includes('/board-api/kanban')) {
            console.log('[Backlog Tracker V5] 🎯 FOUND Kanban API in iframe!');
            // iframe内のレスポンス処理
            tracker.processFrameResponse(response.clone(), url, frameIndex);
          }
          
          return response;
        };
      }
    } catch (e) {
      console.log(`[Backlog Tracker V5] Cannot intercept iframe ${frameIndex}:`, e.message);
    }
  }
  
  processWebSocketData(data) {
    console.log('[Backlog Tracker V5] 🔄 Processing WebSocket data for updateCard...');
    
    const updateCard = this.findUpdateCardInData(data);
    if (updateCard) {
      console.log('[Backlog Tracker V5] 🎯 Found updateCard in WebSocket data!');
      this.handleUpdateCard(updateCard);
    }
  }
  
  async processFrameResponse(response, url, frameIndex) {
    try {
      const text = await response.text();
      console.log(`[Backlog Tracker V5] 📄 iframe ${frameIndex} response:`, text.substring(0, 200));
      
      if (text.includes('updateCard')) {
        const data = JSON.parse(text);
        const updateCard = data.data?.updateCard || data.updateCard;
        if (updateCard) {
          console.log('[Backlog Tracker V5] 🎯 Found updateCard in iframe response!');
          this.handleUpdateCard(updateCard);
        }
      }
    } catch (e) {
      console.log(`[Backlog Tracker V5] Error processing iframe ${frameIndex} response:`, e.message);
    }
  }
  
  setupEventBasedNetworkMonitoring() {
    console.log('[Backlog Tracker V5] 🔧 Setting up event-based network monitoring');
    
    // Performance APIでネットワークリクエストを監視
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource' && entry.name.includes('/board-api/kanban')) {
            console.log('[Backlog Tracker V5] 📡 Performance API detected Kanban request:', {
              name: entry.name,
              initiatorType: entry.initiatorType,
              duration: entry.duration,
              transferSize: entry.transferSize
            });
          }
        });
      });
      
      try {
        observer.observe({ entryTypes: ['resource'] });
        console.log('[Backlog Tracker V5] ✅ PerformanceObserver activated');
      } catch (e) {
        console.log('[Backlog Tracker V5] ❌ PerformanceObserver not supported');
      }
    }
    
    // MutationObserverでDOM変更を監視（間接的にネットワーク活動を推測）
    if ('MutationObserver' in window) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          // カードの位置変更やステータス変更を監視
          if (mutation.type === 'childList' || mutation.type === 'attributes') {
            const target = mutation.target;
            if (target && target.className && typeof target.className === 'string') {
              if (target.className.includes('card') || 
                  target.className.includes('kanban') ||
                  target.className.includes('issue')) {
                console.log('[Backlog Tracker V5] 👁️ DOM mutation in potential card element:', {
                  type: mutation.type,
                  target: target.tagName,
                  className: target.className
                });
              }
            }
          }
        });
      });
      
      // DOMが読み込まれてから監視開始
      const startDOMObserver = () => {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-status', 'style']
        });
        console.log('[Backlog Tracker V5] ✅ MutationObserver activated');
      };
      
      if (document.body) {
        startDOMObserver();
      } else {
        document.addEventListener('DOMContentLoaded', startDOMObserver);
      }
    }
  }

  setupNetworkInterception() {
    console.log('[Backlog Tracker V5] 🔧 Setting up comprehensive network interception');
    console.log('[Backlog Tracker V5] 📊 Current window state:', {
      hasFetch: typeof window.fetch === 'function',
      hasXMLHttpRequest: typeof window.XMLHttpRequest === 'function',
      hasAxios: typeof window.axios !== 'undefined',
      hasJQuery: typeof window.$ !== 'undefined'
    });
    
    // デバッグ: 全てのプロパティをチェック
    this.debugNetworkMethods();
    
    // より強力なXMLHttpRequestの監視
    this.setupXHRInterception();
    
    // axios監視（もし存在する場合）
    this.setupAxiosInterception();
    
    // メインのfetch監視
    const originalFetch = window.fetch;
    const tracker = this;
    
    window.fetch = async function(...args) {
      const url = args[0];
      const options = args[1] || {};
      
      // すべてのfetchをログ出力（デバッグ用）
      console.log('[Backlog Tracker V5] 🌐 ALL FETCH INTERCEPTED:', {
        url: url,
        method: options.method || 'GET',
        timestamp: new Date().toISOString()
      });
      
      if (url && typeof url === 'string' && tracker.isBacklogKanbanAPI(url)) {
        const isUpdateCardMutation = tracker.isUpdateCardMutation(options.body);
        
        console.log('[Backlog Tracker V5] 🎯 Backlog Kanban fetch intercepted:', {
          url: url,
          method: options.method || 'GET',
          headers: options.headers,
          isUpdateCardMutation: isUpdateCardMutation,
          hasBody: !!options.body
        });
        
        if (options.body) {
          console.log('[Backlog Tracker V5] 📤 Fetch body preview:', 
            typeof options.body === 'string' ? options.body.substring(0, 200) : options.body);
        }
      }
      
      // 元のfetchを実行
      const response = await originalFetch.apply(this, args);
      
      // Backlog Kanban APIのレスポンスを処理
      if (url && typeof url === 'string' && tracker.isBacklogKanbanAPI(url)) {
        const isUpdateCardMutation = tracker.isUpdateCardMutation(options.body);
        
        console.log('[Backlog Tracker V5] 📥 Backlog fetch response received:', {
          url: url,
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          isUpdateCardMutation: isUpdateCardMutation
        });
        
        // レスポンスを処理（クローンして）
        try {
          const clone = response.clone();
          const text = await clone.text();
          
          console.log('[Backlog Tracker V5] 📄 Response body length:', text.length);
          console.log('[Backlog Tracker V5] 📄 Response preview:', text.substring(0, 300));
          
          if (text && text.length > 0) {
            try {
              const responseData = JSON.parse(text);
              console.log('[Backlog Tracker V5] 📊 Fetch Parsed response structure:', {
                hasData: !!responseData.data,
                hasUpdateCard: !!(responseData.data?.updateCard || responseData.updateCard),
                topLevelKeys: Object.keys(responseData)
              });
              
              // GraphQLレスポンスの場合、data.updateCardまたは直接updateCardを確認
              const updateCard = responseData.data?.updateCard || responseData.updateCard;
              
              if (updateCard) {
                console.log('[Backlog Tracker V5] 🎯 FOUND updateCard in fetch response!', updateCard);
                tracker.handleUpdateCard(updateCard);
              } else if (isUpdateCardMutation) {
                console.log('[Backlog Tracker V5] ⚠️ updateCard mutation request but no updateCard in fetch response');
                tracker.analyzeResponseStructure(responseData);
              } else {
                console.log('[Backlog Tracker V5] ℹ️ Not an updateCard mutation, skipping detailed analysis');
              }
            } catch (parseError) {
              console.log('[Backlog Tracker V5] Response is not JSON:', parseError.message);
            }
          } else {
            console.log('[Backlog Tracker V5] ⚠️ Empty response body');
          }
        } catch (e) {
          console.error('[Backlog Tracker V5] Fetch response processing error:', e);
        }
      }
      
      return response;
    };
  }
  
  setupAxiosInterception() {
    console.log('[Backlog Tracker V5] 🔧 Setting up axios interception');
    
    // axiosが読み込まれるのを待つ
    const checkAxios = () => {
      if (window.axios) {
        console.log('[Backlog Tracker V5] 🎯 axios detected, setting up interceptors');
        
        const tracker = this;
        
        // リクエストインターセプター
        window.axios.interceptors.request.use(
          (config) => {
            if (tracker.isBacklogKanbanAPI(config.url)) {
              const isUpdateCardMutation = tracker.isUpdateCardMutation(config.data);
              console.log('[Backlog Tracker V5] 🎯 Axios request intercepted:', {
                url: config.url,
                method: config.method,
                isUpdateCardMutation: isUpdateCardMutation
              });
            }
            return config;
          },
          (error) => {
            return Promise.reject(error);
          }
        );

        // レスポンスインターセプター
        window.axios.interceptors.response.use(
          (response) => {
            if (tracker.isBacklogKanbanAPI(response.config.url)) {
              const isUpdateCardMutation = tracker.isUpdateCardMutation(response.config.data);
              console.log('[Backlog Tracker V5] 📥 Axios response intercepted:', {
                url: response.config.url,
                status: response.status,
                isUpdateCardMutation: isUpdateCardMutation
              });
              
              if (response.data) {
                const updateCard = response.data.data?.updateCard || response.data.updateCard;
                if (updateCard) {
                  console.log('[Backlog Tracker V5] 🎯 FOUND updateCard in axios response!', updateCard);
                  tracker.handleUpdateCard(updateCard);
                }
              }
            }
            return response;
          },
          (error) => {
            return Promise.reject(error);
          }
        );
      } else {
        // axiosがまだ読み込まれていない場合は少し待って再試行
        setTimeout(checkAxios, 100);
      }
    };
    
    checkAxios();
  }

  setupXHRInterception() {
    console.log('[Backlog Tracker V5] 🔧 Setting up XMLHttpRequest interception');
    
    const originalXHR = window.XMLHttpRequest;
    const tracker = this;
    
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      const originalSend = xhr.send;
      
      let requestInfo = {};
      
      xhr.open = function(method, url, ...args) {
        requestInfo = { method, url };
        console.log('[Backlog Tracker V5] 📤 ALL XHR OPEN INTERCEPTED:', { 
          method, 
          url,
          timestamp: new Date().toISOString()
        });
        return originalOpen.call(this, method, url, ...args);
      };
      
      xhr.send = function(data) {
        if (tracker.isBacklogKanbanAPI(requestInfo.url)) {
          // GraphQL updateCard mutationかチェック
          const isUpdateCardMutation = tracker.isUpdateCardMutation(data);
          
          console.log('[Backlog Tracker V5] 🎯 Backlog XHR request:', {
            ...requestInfo,
            isUpdateCardMutation: isUpdateCardMutation,
            hasRequestBody: !!data
          });
          
          if (data) {
            console.log('[Backlog Tracker V5] 📤 Request body preview:', 
              typeof data === 'string' ? data.substring(0, 200) : data);
          }
          
          xhr.addEventListener('load', function() {
            console.log('[Backlog Tracker V5] 📥 XHR Response received:', {
              url: requestInfo.url,
              method: requestInfo.method,
              status: xhr.status,
              statusText: xhr.statusText,
              isUpdateCardMutation: isUpdateCardMutation
            });
            
            if (xhr.status === 200 && xhr.responseText) {
              console.log('[Backlog Tracker V5] 📄 XHR Response body length:', xhr.responseText.length);
              console.log('[Backlog Tracker V5] 📄 XHR Response preview:', xhr.responseText.substring(0, 300));
              
              try {
                const responseData = JSON.parse(xhr.responseText);
                console.log('[Backlog Tracker V5] 📊 XHR Parsed response structure:', {
                  hasData: !!responseData.data,
                  hasUpdateCard: !!(responseData.data?.updateCard || responseData.updateCard),
                  topLevelKeys: Object.keys(responseData)
                });
                
                // GraphQLレスポンスの場合、data.updateCardまたは直接updateCardを確認
                const updateCard = responseData.data?.updateCard || responseData.updateCard;
                
                if (updateCard) {
                  console.log('[Backlog Tracker V5] 🎯 FOUND updateCard in XHR response!', updateCard);
                  tracker.handleUpdateCard(updateCard);
                } else if (isUpdateCardMutation) {
                  console.log('[Backlog Tracker V5] ⚠️ updateCard mutation request but no updateCard in response');
                  tracker.analyzeResponseStructure(responseData);
                } else {
                  console.log('[Backlog Tracker V5] ℹ️ Not an updateCard mutation, skipping detailed analysis');
                }
              } catch (error) {
                console.error('[Backlog Tracker V5] XHR Response processing error:', error);
                console.log('[Backlog Tracker V5] Raw response that failed to parse:', xhr.responseText.substring(0, 500));
              }
            }
          });
        }
        
        return originalSend.call(this, data);
      };
      
      return xhr;
    };
  }

  analyzeResponseStructure(data) {
    console.log('[Backlog Tracker V5] 🔍 Analyzing response structure...');
    
    const findInterestingData = (obj, path = '', depth = 0) => {
      if (depth > 3) return; // 深すぎる場合は停止
      
      if (typeof obj === 'object' && obj !== null) {
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          
          // 興味深いキーワードを検索
          const interestingKeys = ['card', 'task', 'issue', 'status', 'move', 'update', 'drag', 'drop'];
          if (interestingKeys.some(keyword => key.toLowerCase().includes(keyword))) {
            console.log(`[Backlog Tracker V5] 🔍 Found interesting key: ${currentPath}`, value);
          }
          
          // 再帰的に検索
          if (typeof value === 'object' && value !== null) {
            findInterestingData(value, currentPath, depth + 1);
          }
        }
      }
    };
    
    findInterestingData(data);
  }
  
  isBacklogKanbanAPI(url) {
    if (!url) return false;
    
    const patterns = [
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/board-api\/kanban/,
      /https?:\/\/[^\/]+\.backlog\.(com|jp)\/api\/.*kanban/
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }
  
  isUpdateCardMutation(requestBody) {
    if (!requestBody) return false;
    
    try {
      let bodyString = requestBody;
      
      // リクエストボディが文字列でない場合は文字列に変換
      if (typeof requestBody !== 'string') {
        if (requestBody instanceof FormData) {
          return false; // FormDataは対象外
        }
        bodyString = JSON.stringify(requestBody);
      }
      
      // GraphQL updateCard mutationの特徴を検索
      const indicators = [
        'operationName":"updateCard"',
        '"operationName":"updateCard"',
        'mutation updateCard',
        'updateCard(',
        'UpdateIssueInputType'
      ];
      
      const isUpdateCard = indicators.some(indicator => bodyString.includes(indicator));
      
      if (isUpdateCard) {
        console.log('[Backlog Tracker V5] 🎯 Detected updateCard GraphQL mutation in request body');
        
        // さらに詳細なログ（デバッグ用）
        try {
          const parsedBody = JSON.parse(bodyString);
          console.log('[Backlog Tracker V5] 📋 GraphQL request details:', {
            operationName: parsedBody.operationName,
            hasVariables: !!parsedBody.variables,
            hasCardId: !!(parsedBody.variables?.cardId),
            hasChanges: !!(parsedBody.variables?.changes)
          });
        } catch (e) {
          console.log('[Backlog Tracker V5] Could not parse request body as JSON');
        }
      }
      
      return isUpdateCard;
    } catch (error) {
      console.error('[Backlog Tracker V5] Error checking updateCard mutation:', error);
      return false;
    }
  }

  // DevToolsから呼び出される主要メソッド
  async handleUpdateCard(updateCard) {
    console.log('[Backlog Tracker V5] 🎯 Processing updateCard:', updateCard);
    
    if (!updateCard.issue) {
      console.log('[Backlog Tracker V5] ⚠️ updateCard has no issue data');
      return;
    }
    
    const issue = updateCard.issue;
    console.log('[Backlog Tracker V5] 📋 Issue data:', {
      issueKey: issue.issueKey,
      summary: issue.summary,
      status: issue.status,
      id: issue.id
    });
    
    const taskInfo = {
      id: this.generateTaskId(issue.issueKey),
      title: issue.summary,
      status: issue.status ? issue.status.name : 'Unknown',
      issueKey: issue.issueKey,
      issueId: issue.id,
      projectId: issue.projectId,
      projectName: this.getProjectName(),
      spaceId: this.getSpaceId()
    };
    
    console.log('[Backlog Tracker V5] ✅ Extracted task info from updateCard:', taskInfo);
    
    // 初期描画時の誤作動を防ぐため、実際にステータス変更があった場合のみ処理
    if (this.isActualStatusChange(taskInfo)) {
      console.log('[Backlog Tracker V5] 🔄 Detected actual status change, processing...');
      await this.checkAndProcessTaskChange(taskInfo);
    } else {
      console.log('[Backlog Tracker V5] ⏸️ No actual status change detected, skipping...');
    }
  }
  
  isActualStatusChange(taskInfo) {
    // 初期描画時やページロード時の処理を除外するためのチェック
    
    // 1. 前回の状態と比較
    const taskKey = `${taskInfo.issueKey || taskInfo.id}`;
    const lastKnownStatus = this.lastKnownStatuses?.get(taskKey);
    
    if (!this.lastKnownStatuses) {
      this.lastKnownStatuses = new Map();
    }
    
    console.log('[Backlog Tracker V5] 📊 Status change check:', {
      taskKey: taskKey,
      currentStatus: taskInfo.status,
      lastKnownStatus: lastKnownStatus,
      isNewTask: !lastKnownStatus,
      isStatusChanged: lastKnownStatus && lastKnownStatus !== taskInfo.status
    });
    
    // 2. 初回ロード時は記録のみで処理しない
    if (!lastKnownStatus) {
      console.log('[Backlog Tracker V5] 📝 Recording initial status for task:', taskKey, taskInfo.status);
      this.lastKnownStatuses.set(taskKey, taskInfo.status);
      return false; // 初回は処理しない
    }
    
    // 3. ステータスが実際に変更された場合のみ処理
    if (lastKnownStatus !== taskInfo.status) {
      console.log('[Backlog Tracker V5] ✅ Status actually changed:', {
        from: lastKnownStatus,
        to: taskInfo.status
      });
      
      // 新しいステータスを記録
      this.lastKnownStatuses.set(taskKey, taskInfo.status);
      return true;
    }
    
    console.log('[Backlog Tracker V5] ⚠️ No status change detected');
    return false;
  }
  
  async checkAndProcessTaskChange(taskInfo) {
    console.log('[Backlog Tracker V5] 🔍 Checking against active timers...');
    
    try {
      // Background Scriptから現在のアクティブタイマーを取得
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TIMERS' }, resolve);
      });
      
      if (response && response.activeTimers) {
        console.log('[Backlog Tracker V5] 📊 Active timers received:', response.activeTimers);
        
        // アクティブタイマーの中から一致するタスクを検索
        const matchingTimer = this.findMatchingTimer(taskInfo, response.activeTimers);
        
        if (matchingTimer) {
          console.log('[Backlog Tracker V5] ✅ Found matching active timer:', matchingTimer);
          await this.processMatchingTaskChange(taskInfo, matchingTimer);
        } else {
          console.log('[Backlog Tracker V5] 📝 No matching active timer found, treating as new status change');
          this.sendStatusChange(taskInfo);
        }
      } else {
        console.log('[Backlog Tracker V5] ⚠️ No active timers or failed to get response');
        this.sendStatusChange(taskInfo);
      }
    } catch (error) {
      console.error('[Backlog Tracker V5] ❌ Error checking active timers:', error);
      // エラーの場合は通常の処理にフォールバック
      this.sendStatusChange(taskInfo);
    }
  }
  
  findMatchingTimer(taskInfo, activeTimers) {
    console.log('[Backlog Tracker V5] 🔍 Searching for matching timer...');
    console.log('[Backlog Tracker V5] 📋 Task to match:', {
      title: taskInfo.title,
      issueKey: taskInfo.issueKey,
      spaceId: taskInfo.spaceId
    });
    
    for (const [timerId, timerData] of Object.entries(activeTimers)) {
      console.log(`[Backlog Tracker V5] 🔍 Checking timer ${timerId}:`, {
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
      
      console.log(`[Backlog Tracker V5] 🎯 Match analysis for ${timerId}:`, {
        titleMatch: titleMatch,
        issueKeyMatch: issueKeyMatch,
        spaceMatch: spaceMatch
      });
      
      // Issue Keyが一致すれば確実に同じタスク
      if (issueKeyMatch && spaceMatch) {
        console.log('[Backlog Tracker V5] ✅ Exact match found by issueKey and spaceId');
        return { timerId, timerData };
      }
      
      // Issue Keyがない場合はタイトルとスペースIDで照合
      if (!taskInfo.issueKey && !timerData.issueKey && titleMatch && spaceMatch) {
        console.log('[Backlog Tracker V5] ✅ Match found by title and spaceId');
        return { timerId, timerData };
      }
    }
    
    console.log('[Backlog Tracker V5] ❌ No matching timer found');
    return null;
  }
  
  async processMatchingTaskChange(taskInfo, matchingTimer) {
    console.log('[Backlog Tracker V5] 🔄 Processing matched task change...');
    
    const { timerId, timerData } = matchingTimer;
    const newStatus = taskInfo.status;
    
    console.log('[Backlog Tracker V5] 📊 Task change details:', {
      timerId: timerId,
      currentTask: timerData.taskTitle,
      newStatus: newStatus,
      oldStatus: 'Unknown (was being tracked)'
    });
    
    // 設定を取得して計測継続すべきかチェック
    const shouldContinueTracking = await this.shouldContinueTracking(newStatus);
    
    if (shouldContinueTracking) {
      console.log('[Backlog Tracker V5] ▶️ Status change within tracking statuses, continuing timer');
      // ステータス更新のみ（タイマー継続）
      this.sendStatusUpdate(taskInfo, timerData);
    } else {
      console.log('[Backlog Tracker V5] ⏹️ Status change to non-tracking status, stopping timer');
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
          console.log('[Backlog Tracker V5] 🎯 Tracking check:', {
            status: status,
            trackingStatuses: backlogSettings.start,
            shouldTrack: shouldTrack
          });
          return shouldTrack;
        }
      }
    } catch (error) {
      console.error('[Backlog Tracker V5] Error getting settings:', error);
    }
    
    // フォールバック: 一般的な作業中ステータス（厳格に）
    const trackingStatuses = ['処理中'];  // より厳格に
    return trackingStatuses.includes(status);
  }
  
  async shouldStartTracking(status) {
    // 計測開始の条件チェック（shouldContinueTrackingと同じロジック）
    return await this.shouldContinueTracking(status);
  }
  
  sendStatusUpdate(taskInfo, timerData) {
    console.log('[Backlog Tracker V5] 📤 Sending status update (timer continues):', taskInfo);
    
    // ここでは実際にはタイマーを停止せず、状態更新のみ
    this.sendStatusChange(taskInfo, 'UPDATE');
  }
  
  sendTimerStop(taskInfo, timerData) {
    console.log('[Backlog Tracker V5] 📤 Sending timer stop request:', taskInfo);
    
    // 明示的にタイマー停止を指示
    this.sendStatusChange(taskInfo, 'STOP');
  }

  generateTaskId(issueKey) {
    if (issueKey) {
      return `backlog-${issueKey}`;
    }
    return `backlog-task-${Date.now()}`;
  }

  getProjectName() {
    // URLからプロジェクト名を抽出
    const urlMatch = window.location.href.match(/\/board\/([^\/\?]+)/);
    return urlMatch ? urlMatch[1] : 'Unknown Project';
  }
  
  getSpaceId() {
    // URLからBacklogスペースIDを抽出
    // 例: https://way-space.backlog.com/board-api/kanban → "way-space"
    const urlMatch = window.location.href.match(/https?:\/\/([^.]+)\.backlog\.(com|jp)/);
    const spaceId = urlMatch ? urlMatch[1] : 'unknown-space';
    
    console.log('[Backlog Tracker V5] 🆔 Extracted space ID:', spaceId);
    return spaceId;
  }

  async sendStatusChange(taskInfo, action = null) {
    // 厳格な条件チェック: 計測すべきステータスでない場合は何もしない
    const shouldStart = await this.shouldStartTracking(taskInfo.status);
    const wasTracking = this.currentStatus && await this.shouldContinueTracking(this.currentStatus);
    
    console.log('[Backlog Tracker V5] 🔍 Status change validation:', {
      newStatus: taskInfo.status,
      oldStatus: this.currentStatus,
      shouldStart: shouldStart,
      wasTracking: wasTracking,
      action: action
    });
    
    // 計測開始条件：明示的に「処理中」ステータスの場合のみ
    if (!shouldStart && !wasTracking) {
      console.log('[Backlog Tracker V5] ⏸️ Status change ignored - not a tracking status');
      return;
    }
    
    const changeData = {
      taskId: taskInfo.id,
      newStatus: taskInfo.status,
      oldStatus: this.currentStatus,
      service: 'backlog',
      taskTitle: taskInfo.title,
      projectName: taskInfo.projectName,
      issueKey: taskInfo.issueKey,
      spaceId: taskInfo.spaceId,
      action: action
    };
    
    // タイマーアクションを判定
    const timerAction = this.determineTimerAction(this.currentStatus, taskInfo.status);
    console.log('[Backlog Tracker V5] 🎯 Timer action determined:', timerAction);
    
    console.log('[Backlog Tracker V5] 📤 Sending status change to background:', {
      ...changeData,
      timerAction: timerAction
    });
    
    // 現在の状態を更新
    const previousStatus = this.currentStatus;
    const previousTaskId = this.currentTaskId;
    
    this.currentStatus = taskInfo.status;
    this.currentTaskId = taskInfo.id;
    
    try {
      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: changeData
      }, (response) => {
        console.log('[Backlog Tracker V5] 📥 Background response:', response);
        
        if (response && response.success) {
          console.log('[Backlog Tracker V5] ✅ Status change successfully processed');
          
          // タイマーアクションをログ出力
          if (timerAction === 'START') {
            console.log('[Backlog Tracker V5] ⏱️ Timer STARTED for:', taskInfo.title);
          } else if (timerAction === 'STOP') {
            console.log('[Backlog Tracker V5] ⏹️ Timer STOPPED for:', taskInfo.title);
          } else if (timerAction === 'CONTINUE') {
            console.log('[Backlog Tracker V5] ▶️ Timer CONTINUES for:', taskInfo.title);
          }
        } else {
          console.error('[Backlog Tracker V5] ❌ Background processing failed:', response);
        }
      });
    } catch (error) {
      console.error('[Backlog Tracker V5] Send error:', error);
    }
  }
  
  determineTimerAction(oldStatus, newStatus) {
    // タイマー開始・停止の判定ロジック
    // 通常は Background Script が設定に基づいて判定するが、
    // Content Script でも予測してログ出力
    
    const trackingStatuses = ['処理中', 'now', 'In Progress', '作業中']; // 一般的な作業中ステータス
    
    const wasTracking = oldStatus && trackingStatuses.includes(oldStatus);
    const isTracking = newStatus && trackingStatuses.includes(newStatus);
    
    console.log('[Backlog Tracker V5] 🔍 Timer action analysis:', {
      oldStatus: oldStatus,
      newStatus: newStatus,
      wasTracking: wasTracking,
      isTracking: isTracking
    });
    
    if (!wasTracking && isTracking) {
      return 'START'; // タイマー開始
    } else if (wasTracking && !isTracking) {
      return 'STOP'; // タイマー停止
    } else if (wasTracking && isTracking) {
      return 'CONTINUE'; // タイマー継続
    } else {
      return 'NONE'; // タイマー操作なし
    }
  }

  // デバッグ用: 手動でupdateCardをテスト
  testWithSampleData() {
    console.log('[Backlog Tracker V5] 🧪 Testing with sample updateCard data...');
    
    const sampleUpdateCard = {
      "id": 101933175,
      "issue": {
        "issueKey": "TEST-1",
        "assignee": {
          "name": "政栄 芳明",
          "role": "admin",
          "additionalFilterKeywords": "RO8a0Vouf9 MASAE YOSHIAKI",
          "icon": "NulabAccountIcon.action?userId=1993420",
          "id": 1993420,
          "disabled": false
        },
        "milestones": [],
        "versions": [],
        "issueType": {
          "color": "#7ea800",
          "id": 3460064,
          "descriptionTemplate": null,
          "summaryTemplate": null,
          "name": "タスク"
        },
        "projectId": 652873,
        "id": 110438410,
        "status": {
          "id": 2,
          "name": "処理中",
          "color": "#4488c5",
          "isCustomStatus": false
        },
        "summary": "新規登録",
        "created": "2025/06/17 01:50:22",
        "categories": [],
        "dueDate": null
      },
      "order": "5000000000000000000000000000000000000000000000000000000000000000"
    };
    
    this.handleUpdateCard(sampleUpdateCard);
  }
}

// 初期化（document_startで即座に実行）
console.log('[Backlog Tracker V5] 🔥 SCRIPT LOADED AT DOCUMENT_START - URL:', window.location.href);
console.log('[Backlog Tracker V5] 📊 Document state:', document.readyState);

if (window.location.href.includes('.backlog.')) {
  console.log('[Backlog Tracker V5] 🚀 Starting V5 early initialization (document_start)');
  
  // すぐにネットワーク監視を開始
  console.log('[Backlog Tracker V5] ⚡ Immediately setting up network interception...');
  window.backlogTrackerV5 = new BacklogTaskTrackerV5();
  
  // V4との互換性のため、同じ名前でも公開
  window.backlogTrackerV4 = window.backlogTrackerV5;
  
  console.log('[Backlog Tracker V5] ✅ Early instance created and network monitoring active');
  
  // DOMが読み込まれた後の処理
  const onDOMReady = () => {
    console.log('[Backlog Tracker V5] 📋 DOM ready, completing initialization...');
    console.log('[Backlog Tracker V5] 🔗 DevTools integration ready');
    
    // デバッグ用: 3秒後にサンプルデータでテスト
    setTimeout(() => {
      console.log('[Backlog Tracker V5] 🧪 Running self-test...');
      window.backlogTrackerV5.testWithSampleData();
      
      // fetch interceptorのテスト
      console.log('[Backlog Tracker V5] 🧪 Testing fetch interceptor...');
      fetch('https://httpbin.org/get').then(() => {
        console.log('[Backlog Tracker V5] ✅ Test fetch completed');
      }).catch(() => {
        console.log('[Backlog Tracker V5] ❌ Test fetch failed (expected due to CORS)');
      });
    }, 3000);
  };
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onDOMReady);
  } else {
    onDOMReady();
  }
}

// デバッグ用関数をグローバルに公開
window.testBacklogTrackerV5 = () => {
  if (window.backlogTrackerV5) {
    window.backlogTrackerV5.testWithSampleData();
  }
};