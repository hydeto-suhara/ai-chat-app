// アプリケーション状態
const APP_STATE = {
    apiKey: localStorage.getItem('gemini_api_key') || '',
    conversationHistory: JSON.parse(localStorage.getItem('conversation_history') || '[]'),
    isDarkMode: localStorage.getItem('theme') !== 'light',
    isProcessing: false
};

// DOM要素
const elements = {
    chatContainer: document.getElementById('chatContainer'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    voiceBtn: document.getElementById('voiceBtn'),
    clearBtn: document.getElementById('clearBtn'),
    saveObsidianBtn: document.getElementById('saveObsidianBtn'),
    themeToggle: document.getElementById('themeToggle'),
    settingsModal: document.getElementById('settingsModal'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    saveApiKey: document.getElementById('saveApiKey'),
    statusText: document.getElementById('statusText')
};

// 初期化
function init() {
    // テーマ設定
    if (APP_STATE.isDarkMode) {
        document.body.removeAttribute('data-theme');
    } else {
        document.body.setAttribute('data-theme', 'light');
    }

    // APIキーチェック
    if (!APP_STATE.apiKey) {
        showSettingsModal();
    } else {
        loadConversationHistory();
    }

    // イベントリスナー設定
    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.messageInput.addEventListener('keydown', handleKeyDown);
    elements.voiceBtn.addEventListener('click', handleVoiceInput);
    elements.clearBtn.addEventListener('click', handleClearConversation);
    elements.saveObsidianBtn.addEventListener('click', saveToObsidian);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.saveApiKey.addEventListener('click', saveApiKey);

    // テキストエリアの自動リサイズ
    elements.messageInput.addEventListener('input', autoResize);

    updateStatus('準備完了');
}

// 設定モーダル表示
function showSettingsModal() {
    elements.settingsModal.classList.add('active');
    elements.apiKeyInput.value = APP_STATE.apiKey;
    elements.apiKeyInput.focus();
}

// APIキー保存
function saveApiKey() {
    const apiKey = elements.apiKeyInput.value.trim();
    if (!apiKey) {
        alert('APIキーを入力してください');
        return;
    }

    APP_STATE.apiKey = apiKey;
    localStorage.setItem('gemini_api_key', apiKey);
    elements.settingsModal.classList.remove('active');
    updateStatus('APIキーを保存しました');
}

// メッセージ送信ハンドラ
async function handleSendMessage() {
    const message = elements.messageInput.value.trim();
    if (!message || APP_STATE.isProcessing) return;

    if (!APP_STATE.apiKey) {
        showSettingsModal();
        return;
    }

    // ウェルカムメッセージを削除
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // ユーザーメッセージを表示
    addMessage(message, 'user');
    elements.messageInput.value = '';
    autoResize();

    // AI応答を生成
    await generateAIResponse(message);
}

// メッセージ追加
function addMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = "message ${sender}";

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    elements.chatContainer.appendChild(messageDiv);

    // スクロール
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;

    // 履歴に保存
    APP_STATE.conversationHistory.push({ role: sender, content: text });
    saveConversationHistory();
}

// AI応答生成
async function generateAIResponse(userMessage) {
    APP_STATE.isProcessing = true;
    elements.sendBtn.disabled = true;
    updateStatus('考え中...');

    // タイピングインジケーター表示
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai typing-message';
    typingDiv.innerHTML = "\n        <div class=\"message-content\">\n            <div class=\"typing-indicator\">\n                <span></span><span></span><span></span>\n            </div>\n        </div>\n    ";
    elements.chatContainer.appendChild(typingDiv);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;

    try {
        const response = await callGeminiAPI(userMessage);

        // タイピングインジケーター削除
        typingDiv.remove();

        // AI応答を表示
        addMessage(response, 'ai');
        updateStatus('準備完了');

    } catch (error) {
        typingDiv.remove();
        addMessage('エラーが発生しました: ' + error.message, 'ai');
        updateStatus('エラー発生');
        console.error('AI Response Error:', error);
    } finally {
        APP_STATE.isProcessing = false;
        elements.sendBtn.disabled = false;
    }
}

// Gemini API呼び出し
async function callGeminiAPI(message) {
    const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${APP_STATE.apiKey}";

    // 会話履歴を含めたコンテキスト作成
    const conversationContext = APP_STATE.conversationHistory
        .slice(-10) // 直近10件のみ
        .map(msg => "${msg.role === 'user' ? 'ユーザー' : 'AI'}: ${msg.content}")
        .join('\n\n');

    const fullPrompt = conversationContext
        ? "${conversationContext}\n\nユーザー: ${message}"
        : message;

    const requestBody = {
        contents: [{
            parts: [{
                text: fullPrompt
            }]
        }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
        }
    };

    const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'API呼び出しに失敗しました');
    }

    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
}

// 音声入力
function handleVoiceInput() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        alert('お使いのブラウザは音声入力に対応していません。ChromeまたはEdgeをお試しください。');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        elements.voiceBtn.classList.add('listening');
        updateStatus('お話しください...');
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        elements.messageInput.value = transcript;
        autoResize();
        updateStatus('音声を認識しました');
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        updateStatus('音声認識エラー');
    };

    recognition.onend = () => {
        elements.voiceBtn.classList.remove('listening');
        if (APP_STATE.isProcessing) {
            updateStatus('考え中...');
        } else {
            updateStatus('準備完了');
        }
    };

    recognition.start();
}

// 会話クリア
function handleClearConversation() {
    if (confirm('会話履歴を全て削除しますか?')) {
        APP_STATE.conversationHistory = [];
        localStorage.removeItem('conversation_history');
        elements.chatContainer.innerHTML = "\n            <div class=\"welcome-message\">\n                <div class=\"welcome-icon\">🚀</div>\n                <h2>須原さん専用AIアシスタント</h2>\n                <p>何でも聞いてください。GHL、セミナー準備、コーディング、なんでもサポートします。</p>\n            </div>\n        ";
        updateStatus('会話をクリアしました');
    }
}

// テーマ切替
function toggleTheme() {
    APP_STATE.isDarkMode = !APP_STATE.isDarkMode;
    if (APP_STATE.isDarkMode) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    }
}

// キーボードイベント
function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
    }
}

// テキストエリア自動リサイズ
function autoResize() {
    elements.messageInput.style.height = 'auto';
    elements.messageInput.style.height = elements.messageInput.scrollHeight + 'px';
}

// ステータス更新
function updateStatus(text) {
    elements.statusText.textContent = text;
}

// 会話履歴保存
function saveConversationHistory() {
    localStorage.setItem('conversation_history', JSON.stringify(APP_STATE.conversationHistory));
}

// 会話履歴読み込み
function loadConversationHistory() {
    if (APP_STATE.conversationHistory.length === 0) return;

    // ウェルカムメッセージを削除
    const welcomeMsg = elements.chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }

    // 履歴を表示
    APP_STATE.conversationHistory.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = "message ${msg.role}";

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = msg.content;

        messageDiv.appendChild(contentDiv);
        elements.chatContainer.appendChild(messageDiv);
    });

    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

// Obsidian保存機能
function saveToObsidian() {
    if (APP_STATE.conversationHistory.length === 0) {
        alert('保存する会話がありません');
        return;
    }

    const markdown = generateMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const filename = "AI会話_${formatDate(now)}.md";

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
    updateStatus('Obsidianに保存しました');
}

function generateMarkdown() {
    const now = new Date();
    const dateStr = formatDateFull(now);

    let markdown = "# AI会話 - ${dateStr}\n\n";

    APP_STATE.conversationHistory.forEach(msg => {
        const role = msg.role === 'user' ? 'ユーザー' : 'AI';
        markdown += "## ${role}\n\n${msg.content}\n\n";

    });

    markdown += "---\n作成日時: ${dateStr}\n";

    return markdown;
}

function formatDate(date) {
    return "${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}";
}

function formatDateFull(date) {
    return "${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}";
}

// アプリ起動
document.addEventListener('DOMContentLoaded', init);
