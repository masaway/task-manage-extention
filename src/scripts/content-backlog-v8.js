class BacklogTaskTrackerV8 {
  constructor() {
    this.taskStates = new Map();
    this.isDisabled = false; // Extension context無効化フラグ
    this.trackingStatus = null; // ユーザー設定の計測対象ステータス
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

    // Extension contextの状態をチェック
    this.checkExtensionContext();

    if (!this.isDisabled) {
      // 設定を読み込んでからタスク検知システムを初期化
      this.loadSettings().then(() => {
        this.setupMutationObserver();
        this.setupPointerMonitoring();
        this.initializeTaskStates();
      });
      
      this.setupBackgroundMessageListener();
    } else {
    }
  }

  checkExtensionContext() {
    // Extension context が無効化されているかチェック
    if (!chrome.runtime?.id) {
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
      this.trackingStatus = result.settings?.trackingStatuses?.backlog?.start?.[0] || null;
    } catch (error) {
      this.trackingStatus = null;
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
    // Extension context無効化チェック
    if (this.isDisabled) {
      return;
    }
    
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
        return true;
      }
      
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
    
    
    taskElements.forEach(taskElement => {
      if (this.isKanbanCardElement(taskElement)) {
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
        return;
      }
      
      const oldStatus = this.taskStates.get(task.id);
      
      if (oldStatus && oldStatus !== task.status) {
        this.changeTimestamps.set(task.id, now);
        
        // ユーザー設定のステータスと比較して計測開始/終了を判定
        const isTrackingStart = (task.status === this.trackingStatus);
        const isTrackingEnd = (oldStatus === this.trackingStatus && task.status !== this.trackingStatus);
        
        
        if (isTrackingStart || isTrackingEnd) {
          const changeInfo = {
            taskId: task.id,
            oldStatus: oldStatus,
            newStatus: task.status,
            taskTitle: task.title,
            issueKey: task.issueKey,
            spaceId: task.spaceId,
            detectionMethod: 'mutation',
            detectionSource: detectionSource,
            timestamp: now,
            isTrackingStart: isTrackingStart,
            isTrackingEnd: isTrackingEnd
          };
          
          this.notifyStatusChange(changeInfo);
        }
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
      }
    }
  }

  handlePointerUp(e) {
    if (this.pointerStartTask) {
      this.detectionStats.pointer++;
      
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
        
        
        if (isTrackingStart || isTrackingEnd) {
          const changeInfo = {
            taskId: originalTask.id,
            oldStatus: originalTask.status,
            newStatus: currentTask.status,
            taskTitle: currentTask.title,
            issueKey: currentTask.issueKey,
            spaceId: currentTask.spaceId,
            detectionMethod: 'pointer',
            detectionSource: 'drag-drop',
            timestamp: now,
            isTrackingStart: isTrackingStart,
            isTrackingEnd: isTrackingEnd
          };
          
          this.notifyStatusChange(changeInfo);
        }
        
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
              // シンプルなテキスト抽出（ユーザー設定ステータスとの比較用）
              headerText = headerText?.replace(/[\d\(\)\[\]]/g, '').trim();
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
    // 空でないテキストなら有効（ユーザー設定との比較は別途実施）
    return text && text.trim().length > 0;
  }

  normalizeStatus(rawStatus) {
    if (!rawStatus) return null;
    
    // 数字とマークを除去してそのまま返す
    return rawStatus.toString().replace(/[\d\(\)\[\]]/g, '').trim();
  }

  // ==========================================
  // ヘルパーメソッド
  // ==========================================
  
  getStatusNameById(statusId) {
    // ステータスIDからステータス名を取得（実際のDOM要素から）
    const statusElement = document.querySelector(`[data-statusid="${statusId}"]`);
    if (statusElement) {
      const headerElement = statusElement.querySelector('.columnHeader h3, .columnHeader span, [class*="header"] span');
      if (headerElement) {
        const statusText = headerElement.textContent?.replace(/[\d\(\)\[\]]/g, '').trim();
        return statusText || null;
      }
    }
    return null;
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
    }
  }

  notifyStatusChange(changeInfo) {
    
    // Extension context が無効化されているかチェック
    if (!chrome.runtime?.id) {
      this.disableTracker();
      return;
    }

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
      }, (response) => {
        if (chrome.runtime.lastError) {
          
          // Extension context が無効化された場合
          if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            this.disableTracker();
          }
        } else {
        }
      });
    } catch (error) {
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
    document.removeEventListener('pointerdown', this.handlePointerDown);
    document.removeEventListener('pointerup', this.handlePointerUp);
    
    
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
      background: linear-gradient(90deg, #ff6b6b, #ee5a24);
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
  }
};

window.setBacklogDebounceDelay = (delayMs) => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.debounceDelay = delayMs;
  }
};

window.clearBacklogChangeHistory = () => {
  if (window.backlogTrackerV8) {
    window.backlogTrackerV8.changeTimestamps.clear();
    window.backlogTrackerV8.pendingChanges.clear();
  }
};