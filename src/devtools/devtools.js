// DevTools Network API を使用したネットワーク監視
console.log('[DevTools] 🔥 Loading DevTools script for Backlog tracking V5');

// リクエスト数をカウント
let requestCount = 0;
let kanbanRequestCount = 0;

chrome.devtools.network.onRequestFinished.addListener((request) => {
  const url = request.request.url;
  requestCount++;
  
  // すべてのBacklogリクエストをログ
  if (url.includes('.backlog.')) {
    console.log(`[DevTools] 🌐 Backlog request #${requestCount}:`, url);
  }
  
  // Backlog Kanban APIを特定（より厳密なパターンマッチング）
  const isKanbanAPI = url.includes('.backlog.') && 
                     (url.includes('/board-api/kanban') || 
                      url.includes('/api/') && url.includes('kanban'));
                      
  if (isKanbanAPI) {
    kanbanRequestCount++;
    console.log(`[DevTools] 🎯 Kanban API #${kanbanRequestCount} detected:`, url);
    
    // リクエスト詳細をログ
    console.log('[DevTools] 📋 Request details:', {
      method: request.request.method,
      status: request.response.status,
      mimeType: request.response.mimeType,
      headers: request.response.headers
    });
    
    // レスポンスボディを取得
    request.getContent((content, encoding) => {
      console.log(`[DevTools] 📥 Getting response content for request #${kanbanRequestCount}, encoding:`, encoding);
      
      if (content) {
        console.log(`[DevTools] 📄 Content length: ${content.length}`);
        
        try {
          const data = JSON.parse(content);
          console.log('[DevTools] ✅ Parsed JSON response keys:', Object.keys(data));
          
          // updateCardが含まれているかチェック
          if (data.updateCard) {
            console.log('[DevTools] 🎯 updateCard found!', data.updateCard);
            
            // Content scriptに直接データを送信
            const evalCode = `
              console.log('[DevTools→Content] Processing updateCard from DevTools');
              console.log('[DevTools→Content] Available trackers:', {
                v5: !!window.backlogTrackerV5,
                v4: !!window.backlogTrackerV4
              });
              
              // BacklogTrackerV5インスタンスを呼び出し
              if (window.backlogTrackerV5) {
                console.log('[DevTools→Content] Using V5 tracker');
                window.backlogTrackerV5.handleUpdateCard(${JSON.stringify(data.updateCard)});
              } else if (window.backlogTrackerV4) {
                console.log('[DevTools→Content] Using V4 tracker');
                window.backlogTrackerV4.handleUpdateCard(${JSON.stringify(data.updateCard)});
              } else {
                console.warn('[DevTools→Content] No backlogTracker found');
              }
            `;
            
            chrome.devtools.inspectedWindow.eval(evalCode, (result, isException) => {
              if (isException) {
                console.error('[DevTools] ❌ Error executing in content script:', isException);
              } else {
                console.log('[DevTools] ✅ Successfully sent updateCard to content script');
              }
            });
          } else {
            console.log('[DevTools] ⚠️ No updateCard in response. Available keys:', Object.keys(data));
            
            // データ構造をより詳しく調査
            if (data.data && typeof data.data === 'object') {
              console.log('[DevTools] 🔍 Checking data.data:', Object.keys(data.data));
            }
            if (Array.isArray(data)) {
              console.log('[DevTools] 🔍 Response is array with length:', data.length);
            }
          }
          
        } catch (error) {
          console.error('[DevTools] ❌ JSON parse error:', error.message);
          console.log('[DevTools] 📄 Raw content preview (first 300 chars):', content.substring(0, 300));
          
          // JSONではない場合でもupdateCardを検索
          if (content.includes('updateCard')) {
            console.log('[DevTools] 🔍 Found "updateCard" string in non-JSON response');
          }
        }
      } else {
        console.log('[DevTools] ⚠️ No content in response');
      }
    });
  }
});

// DevTools起動時のログ
console.log('[DevTools] ✅ DevTools Network API listener activated');
console.log('[DevTools] Monitoring for: *.backlog.*/board-api/kanban');

// デバッグ用: 手動でテストレスポンスを送信
window.testDevToolsIntegration = () => {
  const testData = {
    "updateCard": {
      "id": 101933175,
      "issue": {
        "issueKey": "TEST-1",
        "assignee": null,
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
      "order": "5000000000000000000000000000000000000000000000010000000000000000"
    }
  };
  
  console.log('[DevTools] 🧪 Testing with sample data...');
  
  chrome.devtools.inspectedWindow.eval(`
    console.log('[DevTools→Content] Manual test triggered');
    if (window.backlogTrackerV5) {
      window.backlogTrackerV5.handleUpdateCard(${JSON.stringify(testData.updateCard)});
    } else if (window.backlogTrackerV4) {
      window.backlogTrackerV4.handleUpdateCard(${JSON.stringify(testData.updateCard)});
    } else {
      console.error('[DevTools→Content] backlogTracker not available');
    }
  `);
};