class BacklogTaskTracker {
  constructor() {
    this.currentTaskId = null;
    this.currentStatus = null;
    this.observer = null;
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
    console.log('[Backlog Tracker] Starting tracker on:', window.location.href);
    this.detectCurrentTask();
    this.setupObserver();
    this.setupUrlChangeDetection();
    console.log('[Backlog Tracker] Tracker initialized');
  }

  detectCurrentTask() {
    const taskIdFromUrl = this.extractTaskIdFromUrl();
    if (!taskIdFromUrl) return;

    const taskInfo = this.extractTaskInfo();
    if (taskInfo) {
      this.currentTaskId = taskIdFromUrl;
      this.currentStatus = taskInfo.status;
      
      console.log('Backlog Task detected:', {
        id: this.currentTaskId,
        status: this.currentStatus,
        title: taskInfo.title
      });
    }
  }

  extractTaskIdFromUrl() {
    // デバッグ用のfile://URLの場合
    if (window.location.protocol === 'file:') {
      return 'DEBUG-123';
    }
    
    const urlMatch = window.location.href.match(/\/view\/([A-Z]+-\d+)/);
    return urlMatch ? urlMatch[1] : null;
  }

  extractTaskInfo() {
    let status = null;
    let title = null;
    let projectName = null;

    console.log('[Backlog Tracker] Extracting task info from DOM');

    const statusSelectors = [
      '.statusSelect select',
      '.status-select select',
      '[data-test="status-select"] select',
      'select[name*="status"]'
    ];

    for (const selector of statusSelectors) {
      const statusElement = document.querySelector(selector);
      if (statusElement) {
        status = statusElement.options[statusElement.selectedIndex]?.text?.trim();
        if (status) break;
      }
    }

    if (!status) {
      const statusTextSelectors = [
        '.issue-status',
        '.status-label',
        '[data-test="status-label"]'
      ];
      
      for (const selector of statusTextSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          status = element.textContent?.trim();
          if (status) break;
        }
      }
    }

    const titleSelectors = [
      'h1.issue-title',
      '.issue-summary h1',
      '.view-issue-title',
      'h1[data-test="issue-title"]'
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        title = element.textContent?.trim();
        if (title) break;
      }
    }

    const projectSelectors = [
      '.project-name',
      '.breadcrumb .project',
      '[data-test="project-name"]'
    ];

    for (const selector of projectSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        projectName = element.textContent?.trim();
        if (projectName) break;
      }
    }

    if (!title) {
      title = document.title.split(' - ')[0] || 'Unknown Task';
    }

    if (!projectName) {
      const urlProjectMatch = window.location.href.match(/\/projects\/([^\/]+)/);
      projectName = urlProjectMatch ? urlProjectMatch[1] : 'Unknown Project';
    }

    console.log('[Backlog Tracker] Extracted info:', { status, title, projectName });
    return status ? { status, title, projectName } : null;
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
          const removedNodes = Array.from(mutation.removedNodes);
          
          if (addedNodes.some(node => 
            node.nodeType === 1 && (
              node.matches && (
                node.matches('select') ||
                node.querySelector('select') ||
                node.matches('.status') ||
                node.querySelector('.status')
              )
            )
          )) {
            shouldCheck = true;
          }
        } else if (mutation.type === 'attributes') {
          if (mutation.target.tagName === 'SELECT' || 
              mutation.target.className.includes('status')) {
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
      attributeFilter: ['value', 'class', 'selected']
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
  }

  checkForStatusChange() {
    const taskId = this.extractTaskIdFromUrl();
    if (!taskId) return;

    const taskInfo = this.extractTaskInfo();
    if (!taskInfo) return;

    const newStatus = taskInfo.status;
    
    if (taskId !== this.currentTaskId || newStatus !== this.currentStatus) {
      const oldStatus = this.currentStatus;
      const oldTaskId = this.currentTaskId;

      this.currentTaskId = taskId;
      this.currentStatus = newStatus;

      console.log('[Backlog Tracker] Sending message to background:', {
        taskId,
        oldStatus,
        newStatus,
        title: taskInfo.title
      });

      chrome.runtime.sendMessage({
        type: 'TASK_STATUS_CHANGED',
        data: {
          taskId,
          newStatus,
          oldStatus,
          service: 'backlog',
          taskTitle: taskInfo.title,
          projectName: taskInfo.projectName
        }
      }).then(() => {
        console.log('[Backlog Tracker] Message sent successfully');
      }).catch(error => {
        console.error('[Backlog Tracker] Error sending message:', error);
      });
    }
  }
}

// デバッグ用: file://またはbacklogを含むURLで実行
if (window.location.href.includes('backlog') || window.location.protocol === 'file:') {
  console.log('[Backlog Tracker] Initializing tracker');
  new BacklogTaskTracker();
} else {
  console.log('[Backlog Tracker] URL does not match, skipping:', window.location.href);
}