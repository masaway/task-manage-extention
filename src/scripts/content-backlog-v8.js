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

    this.setupMutationObserver();
    this.setupPointerMonitoring();
    this.initializeTaskStates();
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
      
      // React Beautiful DnD関連属性
      if (['data-react-beautiful-dnd-draggable', 
           'data-react-beautiful-dnd-drag-handle',
           'data-rbd-draggable-id',
           'data-rbd-drag-handle-draggable-id'].includes(attributeName)) {
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
      // 追加された要素をチェック
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1 && this.isKanbanCardElement(node)) {
          return true;
        }
      }
      
      // 削除された要素をチェック
      for (const node of mutation.removedNodes) {
        if (node.nodeType === 1 && this.isKanbanCardElement(node)) {
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
    // リクエストアニメーションフレームで効率的に処理
    requestAnimationFrame(() => {
      const processedElements = new Set();
      
      mutations.forEach(mutation => {
        const element = mutation.target;
        
        if (!processedElements.has(element)) {
          processedElements.add(element);
          this.checkElementStatusChange(element);
        }
      });
    });
  }

  checkElementStatusChange(element) {
    const task = this.extractTaskFromElement(element);
    if (!task) return;
    
    const oldStatus = this.taskStates.get(task.id);
    
    if (oldStatus && oldStatus !== task.status) {
      this.notifyStatusChange({
        taskId: task.id,
        oldStatus: oldStatus,
        newStatus: task.status,
        taskTitle: task.title,
        issueKey: task.issueKey,
        spaceId: task.spaceId,
        detectionMethod: 'mutation'
      });
    }
    
    this.taskStates.set(task.id, task.status);
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
      }
    }
  }

  handlePointerUp(e) {
    if (this.pointerStartTask) {
      this.detectionStats.pointer++;
      
      setTimeout(() => {
        this.processPointerDragCompletion();
      }, 150);
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
        
        this.notifyStatusChange({
          taskId: originalTask.id,
          oldStatus: originalTask.status,
          newStatus: currentTask.status,
          taskTitle: currentTask.title,
          issueKey: currentTask.issueKey,
          spaceId: currentTask.spaceId,
          detectionMethod: 'pointer'
        });
        
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
      console.log('[Backlog] Error notifying task initialization:', error);
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
      console.log('[Backlog] Error notifying status change:', error);
    }
  }

  // ==========================================
  // デバッグ用機能
  // ==========================================
  
  getDetectionStats() {
    return {
      ...this.detectionStats,
      taskStates: this.taskStates.size,
      totalDetections: Object.values(this.detectionStats).reduce((a, b) => a + b, 0)
    };
  }

  debugCurrentState() {
    console.group('🔍 Backlog V8 Debug Information');
    console.log('Detection Stats:', this.getDetectionStats());
    console.log('Task States:', Array.from(this.taskStates.entries()));
    console.log('Detection Methods Status:', this.detectionMethods);
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