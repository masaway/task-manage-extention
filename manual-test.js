// 手動テスト用のコード - Backlogページのコンソールに貼り付けて実行

// 1. DOM要素の確認
console.log('=== DOM要素の確認 ===');
const statusSelectors = [
  '.statusSelect select',
  '.status-select select',
  '[data-test="status-select"] select',
  'select[name*="status"]'
];

statusSelectors.forEach(selector => {
  const element = document.querySelector(selector);
  console.log(`${selector}:`, element);
  if (element) {
    console.log('  現在の値:', element.value);
    console.log('  選択中のテキスト:', element.options[element.selectedIndex]?.text);
  }
});

// 2. タイトル要素の確認
const titleSelectors = [
  'h1.issue-title',
  '.issue-summary h1',
  '.view-issue-title',
  'h1[data-test="issue-title"]'
];

titleSelectors.forEach(selector => {
  const element = document.querySelector(selector);
  console.log(`${selector}:`, element?.textContent?.trim());
});

// 3. URL確認
console.log('現在のURL:', window.location.href);
const urlMatch = window.location.href.match(/\/view\/([A-Z]+-\d+)/);
console.log('抽出されたタスクID:', urlMatch ? urlMatch[1] : 'なし');

// 4. メッセージ送信のテスト
function testMessage(taskId, newStatus, oldStatus) {
  console.log('=== メッセージ送信テスト ===');
  chrome.runtime.sendMessage({
    type: 'TASK_STATUS_CHANGED',
    data: {
      taskId: taskId || 'TEST-123',
      newStatus: newStatus || 'now',
      oldStatus: oldStatus || '未対応',
      service: 'backlog',
      taskTitle: 'テストタスク',
      projectName: 'テストプロジェクト'
    }
  });
  console.log('メッセージ送信完了');
}

// 使用例：
// testMessage('TEST-123', 'now', '未対応');
console.log('手動テスト準備完了。testMessage()関数を呼び出してテストしてください。');