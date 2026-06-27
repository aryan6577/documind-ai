// ═══════════════════════════════════════
// MOBILE SIDEBAR — defined first so onclick works
// ═══════════════════════════════════════
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('open');
  }
}

function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}
// ═══════════════════════════════════════
// STATE
// ═══════════════════════════════════════
let isLoading = false;
let currentChatId = null;
let currentChatName = 'New Chat';
let lastUserMessage = '';
let allChats = {};
let currentUserId = null;

function getStorageKey() {
  return `documind_chats_${currentUserId}`;
}

function loadChatsForUser() {
  allChats = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  renderChatHistory();
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
window.onload = () => {
  applyTheme(localStorage.getItem('documind_theme') || 'dark');
  loadGroqKey();
};

// ═══════════════════════════════════════
// THEME
// ═══════════════════════════════════════
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('documind_theme', next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeBtn');
  btn.innerHTML = theme === 'dark'
    ? '<i class="fas fa-sun"></i>'
    : '<i class="fas fa-moon"></i>';
}

// ═══════════════════════════════════════
// GROQ KEY
// ═══════════════════════════════════════
function loadGroqKey() {
  const saved = localStorage.getItem('documind_groq_key') || '';
  document.getElementById('groqKeySettings').value = saved;
}

function getGroqKey() {
  const key = localStorage.getItem('documind_groq_key') || '';
  return key; // Returns '' if not set — server will use its own key
}

// ═══════════════════════════════════════
// CHAT HISTORY
// ═══════════════════════════════════════
function saveChatToHistory(messages) {
  if (!currentChatId) currentChatId = 'chat_' + Date.now();
  allChats[currentChatId] = {
    id: currentChatId,
    name: currentChatName,
    messages,
    timestamp: Date.now()
  };
  localStorage.setItem(getStorageKey(), JSON.stringify(allChats));
  renderChatHistory();
}

function renderChatHistory() {
  const list = document.getElementById('chatHistoryList');
  const chats = Object.values(allChats).sort((a, b) => b.timestamp - a.timestamp);

  if (chats.length === 0) {
    list.innerHTML = '<div class="no-history">No conversations yet</div>';
    return;
  }

  list.innerHTML = chats.map(chat => `
    <div class="history-item ${chat.id === currentChatId ? 'active' : ''}"
         onclick="loadChat('${chat.id}')">
      <i class="fas fa-message"></i>
      <span class="history-name">${chat.name}</span>
      <button class="history-delete" onclick="deleteChat(event, '${chat.id}')">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

function loadChat(chatId) {
  const chat = allChats[chatId];
  if (!chat) return;

  currentChatId = chatId;
  currentChatName = chat.name;

  const messagesEl = document.getElementById('chatMessages');
  messagesEl.innerHTML = '';

  chat.messages.forEach(msg => {
    if (msg.role === 'user') {
      addMessage('user', msg.content);
    } else {
      addMessage('ai', msg.content, msg.sources || [], msg.suggestions || []);
    }
  });

  document.getElementById('headerTitle').textContent = chat.name;
  document.getElementById('renameBtn').style.display = 'flex';
  document.getElementById('exportBtn').style.display = 'flex';
  renderChatHistory();
}

function deleteChat(e, chatId) {
  e.stopPropagation();
  delete allChats[chatId];
  localStorage.setItem(getStorageKey(), JSON.stringify(allChats));
  if (currentChatId === chatId) newChat();
  else renderChatHistory();
}

function newChat() {
  currentChatId = null;
  currentChatName = 'New Chat';
  lastUserMessage = '';

  document.getElementById('chatMessages').innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-logo">D</div>
      <h2>DocuMind AI</h2>
      <p>Your intelligent PDF assistant. Upload documents and ask questions — I'll find answers across all your files instantly.</p>
      <div class="welcome-steps">
        <div class="step">
          <div class="step-num">1</div>
<div class="step-text"><strong>30 Free Messages</strong><span>No setup needed — just upload and chat!</span></div>        </div>
        <div class="step">
          <div class="step-num">2</div>
          <div class="step-text"><strong>Upload Files</strong><span>PDF, Word, Excel, PowerPoint & more</span></div>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <div class="step-text"><strong>Ask Anything</strong><span>AI searches across all files</span></div>
        </div>
      </div>
    </div>`;

  document.getElementById('headerTitle').textContent = 'Upload PDFs to get started';
  document.getElementById('renameBtn').style.display = 'none';
  document.getElementById('exportBtn').style.display = 'none';
  renderChatHistory();
}

// ═══════════════════════════════════════
// RENAME
// ═══════════════════════════════════════
function renameChat() {
  document.getElementById('renameInput').value = currentChatName;
  document.getElementById('renameModal').style.display = 'flex';
  document.getElementById('renameInput').focus();
}

function cancelRename() {
  document.getElementById('renameModal').style.display = 'none';
}

function confirmRename() {
  const newName = document.getElementById('renameInput').value.trim();
  if (!newName) return;
  currentChatName = newName;
  document.getElementById('headerTitle').textContent = newName;
  if (currentChatId && allChats[currentChatId]) {
    allChats[currentChatId].name = newName;
    localStorage.setItem(getStorageKey(), JSON.stringify(allChats));
    renderChatHistory();
  }
  document.getElementById('renameModal').style.display = 'none';
}

// ═══════════════════════════════════════
// SETTINGS MODAL
// ═══════════════════════════════════════
function openSettings() {
  document.getElementById('groqKeySettings').value = getGroqKey();
  updateThemeOptionUI();
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettings() {
  document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
  const key = document.getElementById('groqKeySettings').value.trim();
  localStorage.setItem('documind_groq_key', key);
  closeSettings();
}

function toggleKeyVisibility() {
  const input = document.getElementById('groqKeySettings');
  const btn = document.getElementById('toggleKeyBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
  } else {
    input.type = 'password';
    btn.innerHTML = '<i class="fas fa-eye"></i>';
  }
}

function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem('documind_theme', theme);
  updateThemeOptionUI();
}

function updateThemeOptionUI() {
  const current = document.documentElement.getAttribute('data-theme');
  document.getElementById('darkOption').classList.toggle('active', current === 'dark');
  document.getElementById('lightOption').classList.toggle('active', current === 'light');
}

// ═══════════════════════════════════════
// UPLOAD PDFs WITH PROGRESS BAR
// ═══════════════════════════════════════
async function uploadPDFs() {
  const files = document.getElementById('pdfInput').files;
  const status = document.getElementById('uploadStatus');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');

  if (!files || files.length === 0) return;

  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';

  const fileNames = Array.from(files).map(f => f.name).join(', ');
  status.className = 'upload-bar-status loading';
  status.textContent = `⏳ Processing ${files.length} file(s): ${fileNames.slice(0, 60)}${fileNames.length > 60 ? '...' : ''}`;

  let progress = 0;
  const interval = setInterval(function() {
    if (progress < 85) {
      progress += Math.random() * 8;
      progressBar.style.width = Math.min(progress, 85) + '%';
    }
  }, 400);

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('pdf', files[i]);
  }

  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();

    clearInterval(interval);
    progressBar.style.width = '100%';

    setTimeout(function() {
      progressContainer.style.display = 'none';
      progressBar.style.width = '0%';
    }, 800);

    if (data.rateLimited) {
      status.className = 'upload-bar-status error';
      status.textContent = data.message;
      return;
    }

    if (data.success) {
      let msg = '✅ ' + data.loaded.length + ' file(s) loaded successfully!';
      if (data.errors && data.errors.length > 0) {
        msg += ' ⚠️ ' + data.errors.length + ' failed: ' + data.errors.join(', ');
      }
      status.className = 'upload-bar-status success';
      status.textContent = msg;
      updateDocBar();
      setTimeout(function() {
        status.textContent = '';
        status.className = 'upload-bar-status';
      }, 5000);
    } else {
      status.className = 'upload-bar-status error';
      status.textContent = '❌ ' + data.message;
    }
  } catch (err) {
    clearInterval(interval);
    progressContainer.style.display = 'none';
    status.className = 'upload-bar-status error';
    status.textContent = '❌ Upload failed. Please try again.';
  }
}

async function updateDocBar() {
  const res = await fetch('/documents');
  const data = await res.json();

  document.getElementById('pdfCount').textContent =
    `${data.total} PDF${data.total !== 1 ? 's' : ''}`;
  document.getElementById('uploadedNames').textContent =
    data.documents.map(d => d.name.replace('.pdf', '')).join(' • ');
  document.getElementById('statusDot').classList.toggle('active', data.total > 0);
  document.getElementById('removeAllBtn').style.display =
    data.total > 0 ? 'block' : 'none';

  if (data.total > 0) {
    document.getElementById('headerTitle').textContent =
      `${data.total} document${data.total !== 1 ? 's' : ''} ready`;
    document.getElementById('renameBtn').style.display = 'flex';
    document.getElementById('exportBtn').style.display = 'flex';
  }
}

async function clearAllDocs() {
  await fetch('/clearall', { method: 'POST' });
  document.getElementById('pdfCount').textContent = '0 PDFs';
  document.getElementById('uploadedNames').textContent = '';
  document.getElementById('statusDot').classList.remove('active');
  document.getElementById('removeAllBtn').style.display = 'none';
  document.getElementById('headerTitle').textContent = 'Upload PDFs to get started';
}

// ═══════════════════════════════════════
// DOCUMENT SEARCH
// ═══════════════════════════════════════
async function searchDocs() {
  const query = document.getElementById('docSearchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');
  if (!query) {
    resultsEl.innerHTML = '';
    return;
  }

  resultsEl.innerHTML = '<div class="search-result-item" style="color:var(--text3)"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';

  try {
    const res = await fetch('/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const data = await res.json();

    if (data.results.length === 0) {
      resultsEl.innerHTML = '<div class="search-result-item" style="color:var(--text3); text-align:center; padding:12px">No matches found for "<strong>' + query + '</strong>"</div>';
      return;
    }

    resultsEl.innerHTML = data.results.map(function(r) {
      const highlighted = r.line.replace(
        new RegExp(query, 'gi'),
        function(m) { return '<mark style="background:rgba(37,99,235,0.3);color:var(--accent);border-radius:2px;padding:0 2px">' + m + '</mark>'; }
      );
      return '<div class="search-result-item"><div class="result-doc">📄 ' + r.doc + '</div><div>' + highlighted + '</div></div>';
    }).join('');
  } catch (err) {
    resultsEl.innerHTML = '<div class="search-result-item" style="color:var(--error)">❌ Search failed. Try again.</div>';
  }
}

// ═══════════════════════════════════════
// SEND MESSAGE
// ═══════════════════════════════════════
async function sendMessage(regenerate = false) {
  if (isLoading) return;

  const input = document.getElementById('messageInput');
  const groqKey = getGroqKey(); // Empty string = server uses its own key
  const message = regenerate ? lastUserMessage : input.value.trim();

  if (!message) return;
  

  if (!regenerate) {
    lastUserMessage = message;
    addMessage('user', message);
    input.value = '';
    input.style.height = 'auto';
  }

  const typingId = showTyping();
  isLoading = true;
  document.getElementById('sendBtn').disabled = true;

  try {
    const res = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message, groqKey: groqKey || '', regenerate: regenerate })
    });

    const data = await res.json();
    removeTyping(typingId);
    addMessage('ai', data.reply, data.searchedDocs || [], data.suggestions || []);

    const messages = collectMessages();
    if (!currentChatId) {
      currentChatName = message.slice(0, 40) + (message.length > 40 ? '...' : '');
      document.getElementById('headerTitle').textContent = currentChatName;
      document.getElementById('renameBtn').style.display = 'flex';
      document.getElementById('exportBtn').style.display = 'flex';
    }
    saveChatToHistory(messages);

  } catch (err) {
    removeTyping(typingId);
    addMessage('ai', '❌ Something went wrong. Please try again.');
  }

  isLoading = false;
  document.getElementById('sendBtn').disabled = false;
}

// ═══════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════
function addMessage(role, text, sources = [], suggestions = []) {
  const messages = document.getElementById('chatMessages');
  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'U' : 'D';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

const content = document.createElement('div');
content.className = 'message-content';
if (role === 'ai') {
  content.innerHTML = marked.parse(text);
} else {
  content.textContent = text;
}
bubble.appendChild(content);  content.className = 'message-content';
  content.textContent = text;
  bubble.appendChild(content);

  if (role === 'ai' && sources.length > 0) {
    const tagsDiv = document.createElement('div');
    tagsDiv.className = 'source-tags';
    sources.forEach(src => {
      const tag = document.createElement('span');
      tag.className = 'source-tag';
      tag.title = `Source: ${src}`;
      tag.textContent = `📄 ${src.replace('.pdf', '')}`;
      tag.onclick = () => {
        document.getElementById('docSearchInput').value = src;
        searchDocs();
      };
      tagsDiv.appendChild(tag);
    });
    bubble.appendChild(tagsDiv);
  }

  if (role === 'ai') {
    const actions = document.createElement('div');
    actions.className = 'message-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
    copyBtn.onclick = function() {
  navigator.clipboard.writeText(text);
  showToast('✅ Copied to clipboard', 'success');
  copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
  copyBtn.classList.add('copied');
  setTimeout(function() {
    copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
    copyBtn.classList.remove('copied');
  }, 2000);
};

    const regenBtn = document.createElement('button');
    regenBtn.className = 'action-btn';
    regenBtn.innerHTML = '<i class="fas fa-rotate-right"></i> Regenerate';
    regenBtn.onclick = () => sendMessage(true);

    actions.appendChild(copyBtn);
    actions.appendChild(regenBtn);
    bubble.appendChild(actions);

    if (suggestions.length > 0) {
      const sugDiv = document.createElement('div');
      sugDiv.className = 'suggestions';
      suggestions.forEach(s => {
        if (!s) return;
        const btn = document.createElement('button');
        btn.className = 'suggestion-btn';
        btn.textContent = '💡 ' + s;
        btn.onclick = () => {
          document.getElementById('messageInput').value = s;
          sendMessage();
        };
        sugDiv.appendChild(btn);
      });
      bubble.appendChild(sugDiv);
    }
  }

  div.appendChild(avatar);
  div.appendChild(bubble);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function collectMessages() {
  const msgs = [];
  document.querySelectorAll('.message').forEach(el => {
    const role = el.classList.contains('user') ? 'user' : 'ai';
    const content = el.querySelector('.message-content')?.textContent || '';
    const sources = [...el.querySelectorAll('.source-tag')]
      .map(t => t.title.replace('Source: ', ''));
    const suggestions = [...el.querySelectorAll('.suggestion-btn')]
      .map(b => b.textContent.replace('💡 ', ''));
    msgs.push({ role, content, sources, suggestions });
  });
  return msgs;
}

// ═══════════════════════════════════════
// TYPING & SKELETON
// ═══════════════════════════════════════
function showTyping() {
  const messages = document.getElementById('chatMessages');
  const id = 'typing-' + Date.now();

  const div = document.createElement('div');
  div.className = 'message ai';
  div.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = 'D';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton';
  skeleton.innerHTML = `
    <div class="skeleton-line" style="width:80%"></div>
    <div class="skeleton-line" style="width:60%"></div>
    <div class="skeleton-line" style="width:70%"></div>
  `;

  const typing = document.createElement('div');
  typing.className = 'typing-indicator';
  typing.innerHTML = `
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  `;

  bubble.appendChild(skeleton);
  bubble.appendChild(typing);
  div.appendChild(avatar);
  div.appendChild(bubble);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;

  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ═══════════════════════════════════════
// EXPORT CHAT
// ═══════════════════════════════════════
function exportChatPDF() {
  const messages = document.querySelectorAll('.message');
  if (messages.length === 0) return;

  let content = `DocuMind AI - Chat Export\n`;
  content += `Chat: ${currentChatName}\n`;
  content += `Date: ${new Date().toLocaleString()}\n`;
  content += `${'='.repeat(50)}\n\n`;

  messages.forEach(msg => {
    const role = msg.classList.contains('user') ? 'YOU' : 'DOCUMIND AI';
    const text = msg.querySelector('.message-content')?.textContent || '';
    content += `[${role}]\n${text}\n\n`;
  });

  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DocuMind-${currentChatName}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════
// CLEAR CHAT
// ═══════════════════════════════════════
async function clearChat() {
  await fetch('/clear', { method: 'POST' });
  newChat();
}

// ═══════════════════════════════════════
// KEYBOARD & RESIZE
// ═══════════════════════════════════════
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

document.getElementById('renameModal').addEventListener('click', function(e) {
  if (e.target === this) cancelRename();
});

document.getElementById('renameInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmRename();
});

document.getElementById('settingsModal').addEventListener('click', function(e) {
  if (e.target === this) closeSettings();
});

// ═══════════════════════════════════════
// VOICE INPUT
// ═══════════════════════════════════════
let recognition = null;
let isRecording = false;

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.log('Speech recognition not supported in this browser');
    return false;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    isRecording = true;
    document.getElementById('micBtn').classList.add('recording');
    document.getElementById('micBtn').innerHTML = '<i class="fas fa-stop"></i>';
  };

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    const input = document.getElementById('messageInput');
    input.value = transcript;
    autoResize(input);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    stopVoiceInput();
    if (event.error === 'not-allowed') {
      addMessage('ai', '⚠️ Microphone access denied. Please allow microphone permissions in your browser.');
    }
  };

  recognition.onend = () => {
    stopVoiceInput();
  };

  return true;
}

function toggleVoiceInput() {
  if (!recognition) {
    const supported = initVoiceRecognition();
    if (!supported) {
      addMessage('ai', '⚠️ Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
  }

  if (isRecording) {
    recognition.stop();
  } else {
    document.getElementById('messageInput').value = '';
    recognition.start();
  }
}

function stopVoiceInput() {
  isRecording = false;
  document.getElementById('micBtn').classList.remove('recording');
  document.getElementById('micBtn').innerHTML = '<i class="fas fa-microphone"></i>';
}

// ═══════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════
async function loadUserProfile() {
  try {
    const res = await fetch('/auth/user');
    const data = await res.json();
    if (data.loggedIn) {
      document.getElementById('userPhoto').src = data.user.photo;
      document.getElementById('userName').textContent = data.user.name;
      document.getElementById('userEmail').textContent = data.user.email;

      currentUserId = data.user.id;
      loadChatsForUser();
      updateDocBar();
    }
  } catch (err) {
    console.error('Failed to load user profile');
  }
}

window.addEventListener('load', loadUserProfile);
// ═══════════════════════════════════════
// MOBILE SIDEBAR TOGGLE
// ═══════════════════════════════════════
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
}

function closeSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}
// ═══════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════
function showToast(message, type) {
  if (!type) type = 'info';
  let toast = document.getElementById('toastEl');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastEl';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast ' + type;
  setTimeout(function() { toast.classList.add('show'); }, 10);
  setTimeout(function() {
    toast.classList.remove('show');
  }, 3500);
}
// ═══════════════════════════════════════
// MOBILE SIDEBAR
// ═══════════════════════════════════════
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('open');
  }
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}

// Close sidebar when a chat history item is clicked on mobile
document.addEventListener('click', function(e) {
  if (e.target.closest('.history-item')) {
    if (window.innerWidth <= 768) closeSidebar();
  }
});
// ═══════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════
function showToast(message, type) {
  if (!type) type = 'info';
  let toast = document.getElementById('toastEl');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastEl';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast ' + type;
  setTimeout(function() { toast.classList.add('show'); }, 10);
  setTimeout(function() { toast.classList.remove('show'); }, 3500);
}