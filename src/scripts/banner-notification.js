class BannerNotification {
  constructor() {
    this.currentBanner = null;
    this.bannerQueue = [];
    this.isShowing = false;
    this.setupStyles();
  }

  setupStyles() {
    if (document.getElementById('task-tracker-banner-styles')) return;

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
    styleSheet.id = 'task-tracker-banner-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  show(options) {
    const { type, title, taskTitle, duration, projectName } = options;
    
    // 現在のバナーがある場合は即座に隠す
    if (this.currentBanner) {
      this.hide(true);
    }

    // キューに追加
    this.bannerQueue.push({ type, title, taskTitle, duration, projectName });
    
    // 表示中でなければ次のバナーを表示
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
    // 既存のバナーを削除
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
    
    // 閉じるボタンの処理
    banner.querySelector('.task-tracker-banner-close').addEventListener('click', () => {
      this.hide();
    });

    // バナーをクリックしても閉じる
    banner.addEventListener('click', () => {
      this.hide();
    });

    // ホバー時の処理
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

    // アニメーション開始
    setTimeout(() => {
      banner.classList.add('show');
    }, 50);

    // 自動非表示（4秒後）
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

  // 設定に基づいてバナー通知を表示するかどうかを判定
  async shouldShowBanner() {
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
      });
      
      if (response && response.success && response.settings) {
        // バナー通知の設定があれば使用、なければデフォルトでtrue
        return response.settings.bannerNotifications !== false;
      }
    } catch (error) {
      console.log('[Banner] Settings not available, using default behavior');
    }
    
    return true; // デフォルトは表示
  }

  // 外部からの呼び出し用メソッド
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

// グローバルインスタンスの作成
if (!window.taskTrackerBanner) {
  window.taskTrackerBanner = new BannerNotification();
}