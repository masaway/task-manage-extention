// Chrome拡張機能の通知テスト用スクリプト
// ブラウザのDevToolsコンソールで実行してください

console.log('🧪 Chrome通知テストを開始します...');

// Background scriptにテスト通知を送信
chrome.runtime.sendMessage(
  { type: 'TEST_NOTIFICATION' },
  (response) => {
    if (chrome.runtime.lastError) {
      console.error('❌ エラー:', chrome.runtime.lastError.message);
    } else {
      console.log('✅ 通知送信成功:', response);
    }
  }
);

// 5秒後に追加のテスト通知を送信
setTimeout(() => {
  console.log('🔄 2回目のテスト通知を送信...');
  chrome.runtime.sendMessage(
    { type: 'TEST_NOTIFICATION' },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('❌ エラー:', chrome.runtime.lastError.message);
      } else {
        console.log('✅ 2回目の通知送信成功:', response);
      }
    }
  );
}, 5000);

console.log('📝 使用方法:');
console.log('1. Chrome拡張機能を有効にしてください');
console.log('2. Chromeの通知許可が有効になっているか確認してください');
console.log('3. このスクリプトをBacklog/GitHubページのDevToolsコンソールで実行してください');