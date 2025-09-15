// Dashboard JavaScript functionality

// Global state
let currentTab = 'overview';
let currentConversationData = null;
let allContacts = [];
let allAttachments = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard();
});

function initializeDashboard() {
  // Initialize navigation tabs
  initializeNavigation();
  
  // Initialize buttons and event listeners
  initializeEventListeners();
  
  // Load initial data
  loadDashboardData();
  
  // Initialize preview modal (reuse from popup.js)
  initializePreviewModal();
  
  // Start status checking
  startStatusChecking();
}

// Navigation functionality
function initializeNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.dataset.tab;
      switchTab(targetTab);
    });
  });
}

function switchTab(tabName) {
  // Update active tab
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  
  // Update active content
  document.querySelectorAll('.content-section').forEach(section => {
    section.classList.remove('active');
  });
  document.getElementById(tabName).classList.add('active');
  
  currentTab = tabName;
  
  // Load tab-specific data
  switch(tabName) {
    case 'contacts':
      loadContacts();
      break;
    case 'attachments':
      loadAttachments();
      break;
    case 'conversations':
      loadConversationDisplay();
      break;
  }
}

// Event listeners
function initializeEventListeners() {
  // Header buttons
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadDashboardData();
  });
  
  document.getElementById('settingsBtn').addEventListener('click', () => {
    // Open settings modal (implement similar to popup)
    alert('Settings functionality will be implemented');
  });
  
  // Quick action buttons
  document.getElementById('fetchAllContactsBtn').addEventListener('click', fetchAllContacts);
  document.getElementById('extractCurrentBtn').addEventListener('click', extractCurrentConversation);
  
  // Tab-specific buttons
  document.getElementById('refreshContactsBtn').addEventListener('click', loadContacts);
  document.getElementById('refreshAttachmentsBtn').addEventListener('click', loadAttachments);
  
  // Conversation action buttons
  document.getElementById('downloadMarkdownBtn').addEventListener('click', downloadMarkdown);
  document.getElementById('viewMarkdownBtn').addEventListener('click', viewMarkdown);
  document.getElementById('downloadJsonBtn').addEventListener('click', downloadJson);
  document.getElementById('viewJsonBtn').addEventListener('click', viewJson);
}

// Data loading functions
async function loadDashboardData() {
  try {
    // Load statistics
    await loadStatistics();
    
    // Load recent activity
    await loadRecentActivity();
    
    // Load contacts if not already loaded
    if (allContacts.length === 0) {
      await loadContacts();
    }
    
    updateStatus('Dashboard loaded successfully', 'success');
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    updateStatus('Error loading dashboard data: ' + error.message, 'error');
  }
}

async function loadStatistics() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'allContacts', 
      'conversationData', 
      'lastContactsFetch',
      'totalMessagesExtracted'
    ], (result) => {
      // Update contact count
      const contactCount = result.allContacts ? result.allContacts.length : 0;
      document.getElementById('totalContacts').textContent = contactCount;
      
      // Update message count
      const messageCount = result.conversationData ? result.conversationData.messages.length : 0;
      document.getElementById('totalMessages').textContent = messageCount;
      
      // Update attachment count
      const attachmentCount = result.conversationData ? 
        result.conversationData.messages.reduce((total, msg) => 
          total + (msg.attachments ? msg.attachments.length : 0), 0) : 0;
      document.getElementById('totalAttachments').textContent = attachmentCount;
      
      // Calculate total size (rough estimate)
      let totalSize = 0;
      if (result.conversationData) {
        result.conversationData.messages.forEach(msg => {
          if (msg.attachments) {
            msg.attachments.forEach(att => {
              totalSize += att.fileSize || 0;
            });
          }
        });
      }
      document.getElementById('totalSize').textContent = formatFileSize(totalSize);
      
      resolve();
    });
  });
}

async function loadRecentActivity() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'lastContactsFetch',
      'lastExtractedTime',
      'currentConversationUsername'
    ], (result) => {
      const activityContainer = document.getElementById('recentActivity');
      
      if (!result.lastContactsFetch && !result.lastExtractedTime) {
        activityContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <div class="empty-state-title">No Recent Activity</div>
            <div class="empty-state-description">Start by fetching contacts or extracting conversations</div>
          </div>
        `;
        resolve();
        return;
      }
      
      let activities = [];
      
      if (result.lastContactsFetch) {
        const fetchTime = new Date(result.lastContactsFetch).toLocaleString();
        activities.push({
          icon: '📞',
          title: 'Contacts Fetched',
          description: `Last fetched: ${fetchTime}`,
          time: result.lastContactsFetch
        });
      }
      
      if (result.lastExtractedTime && result.currentConversationUsername) {
        const extractTime = new Date(result.lastExtractedTime).toLocaleString();
        activities.push({
          icon: '💬',
          title: 'Conversation Extracted',
          description: `User: ${result.currentConversationUsername}`,
          time: result.lastExtractedTime
        });
      }
      
      // Sort by time (newest first)
      activities.sort((a, b) => b.time - a.time);
      
      // Display activities
      activityContainer.innerHTML = activities.map(activity => `
        <div class="card" style="margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div style="font-size: 24px;">${activity.icon}</div>
            <div style="flex: 1;">
              <div style="font-weight: 600; margin-bottom: 4px;">${activity.title}</div>
              <div style="font-size: 14px; color: #666;">${activity.description}</div>
            </div>
          </div>
        </div>
      `).join('');
      
      resolve();
    });
  });
}

async function loadContacts() {
  const container = document.getElementById('contactsContainer');
  
  container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading contacts...</div>';
  
  return new Promise((resolve) => {
    chrome.storage.local.get(['allContacts'], (result) => {
      allContacts = result.allContacts || [];
      
      if (allContacts.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👥</div>
            <div class="empty-state-title">No Contacts Found</div>
            <div class="empty-state-description">Click "Fetch All Contacts" to load your Fiverr contacts</div>
          </div>
        `;
        resolve();
        return;
      }
      
      // Display contacts in grid
      container.innerHTML = `
        <div class="contacts-grid">
          ${allContacts.map(contact => `
            <div class="contact-card" onclick="selectContact('${contact.username}')">
              <div class="contact-name">${contact.username || 'Unknown User'}</div>
              <div class="contact-time">Last message: ${formatDate(contact.recentMessageDate)}</div>
              <div class="contact-actions">
                <button class="btn btn-primary" onclick="event.stopPropagation(); extractConversation('${contact.username}')">
                  💬 Extract
                </button>
                <button class="btn btn-secondary" onclick="event.stopPropagation(); viewContactDetails('${contact.username}')">
                  👁️ View
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      
      resolve();
    });
  });
}

async function loadAttachments() {
  const container = document.getElementById('attachmentsContainer');
  
  return new Promise((resolve) => {
    chrome.storage.local.get(['conversationData'], (result) => {
      if (!result.conversationData || !result.conversationData.messages) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📎</div>
            <div class="empty-state-title">No Attachments</div>
            <div class="empty-state-description">Extract conversations to see attachments</div>
          </div>
        `;
        resolve();
        return;
      }
      
      // Collect all attachments
      allAttachments = [];
      result.conversationData.messages.forEach(message => {
        if (message.attachments && message.attachments.length > 0) {
          message.attachments.forEach(attachment => {
            allAttachments.push({
              ...attachment,
              messageSender: message.sender,
              messageTime: message.createdAt
            });
          });
        }
      });
      
      if (allAttachments.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📎</div>
            <div class="empty-state-title">No Attachments</div>
            <div class="empty-state-description">This conversation has no attachments</div>
          </div>
        `;
        resolve();
        return;
      }
      
      // Display attachments
      container.innerHTML = `
        <div class="attachments-grid">
          ${allAttachments.map(attachment => `
            <div class="attachment-card">
              <div class="attachment-info">
                <div class="attachment-name">${attachment.filename}</div>
                <div class="attachment-meta">
                  ${formatFileSize(attachment.fileSize)} • ${attachment.messageSender} • ${formatDate(attachment.messageTime)}
                </div>
              </div>
              <div class="attachment-actions">
                <button class="btn btn-info" onclick="previewAttachment(${JSON.stringify(attachment).replace(/"/g, '&quot;')})">
                  👁️ Preview
                </button>
                <button class="btn btn-primary" onclick="downloadAttachment(${JSON.stringify(attachment).replace(/"/g, '&quot;')})">
                  📥 Download
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      
      resolve();
    });
  });
}

async function loadConversationDisplay() {
  const noConversationDiv = document.getElementById('noConversationSelected');
  const conversationDiv = document.getElementById('conversationDisplay');
  
  return new Promise((resolve) => {
    chrome.storage.local.get(['conversationData', 'currentConversationUsername'], (result) => {
      if (!result.conversationData || !result.currentConversationUsername) {
        noConversationDiv.style.display = 'block';
        conversationDiv.style.display = 'none';
        resolve();
        return;
      }
      
      currentConversationData = result.conversationData;
      noConversationDiv.style.display = 'none';
      conversationDiv.style.display = 'block';
      
      // Update conversation header
      document.getElementById('conversationTitle').textContent = `Conversation with ${result.currentConversationUsername}`;
      document.getElementById('conversationMeta').textContent = `Last updated: ${new Date().toLocaleString()}`;
      
      // Update conversation statistics
      const messages = result.conversationData.messages || [];
      const attachments = messages.reduce((total, msg) => total + (msg.attachments ? msg.attachments.length : 0), 0);
      const totalSize = messages.reduce((total, msg) => {
        if (msg.attachments) {
          return total + msg.attachments.reduce((attTotal, att) => attTotal + (att.fileSize || 0), 0);
        }
        return total;
      }, 0);
      
      document.getElementById('conversationMessages').textContent = messages.length;
      document.getElementById('conversationAttachments').textContent = attachments;
      document.getElementById('conversationSize').textContent = formatFileSize(totalSize);
      
      // Calculate duration
      if (messages.length > 0) {
        const firstMessage = Math.min(...messages.map(m => m.createdAt));
        const lastMessage = Math.max(...messages.map(m => m.createdAt));
        const duration = formatDuration(lastMessage - firstMessage);
        document.getElementById('conversationDuration').textContent = duration;
      }
      
      resolve();
    });
  });
}

// Action functions
function fetchAllContacts() {
  updateStatus('Fetching all contacts...', 'progress');
  
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentUrl = tabs[0].url;
    if (!currentUrl.includes('fiverr.com')) {
      updateStatus('Please navigate to Fiverr first.', 'error');
      return;
    }
    
    // Show progress
    document.getElementById('contactsProgress').style.display = 'block';
    document.getElementById('contactsProgressText').textContent = 'Fetching contacts...';
    
    chrome.runtime.sendMessage({ type: 'FETCH_ALL_CONTACTS' });
  });
}

function extractCurrentConversation() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const url = tabs[0].url;
    const match = url.match(/^https:\/\/www\.fiverr\.com\/inbox\/([^\/\?]+)$/);
    
    if (!match) {
      updateStatus('Please open a specific inbox URL (e.g., https://www.fiverr.com/inbox/username)', 'error');
      return;
    }
    
    const username = match[1];
    updateStatus(`Extracting conversation with ${username}...`, 'progress');
    
    // Show progress
    document.getElementById('extractionProgress').style.display = 'block';
    document.getElementById('extractionProgressText').textContent = 'Extracting conversation...';
    
    chrome.storage.local.set({ currentUsername: username }, () => {
      chrome.runtime.sendMessage({ type: 'EXTRACT_CONVERSATION' });
    });
  });
}

function selectContact(username) {
  // Switch to conversations tab and load this contact's conversation
  switchTab('conversations');
  // TODO: Implement contact selection logic
}

function extractConversation(username) {
  chrome.storage.local.set({ currentUsername: username }, () => {
    chrome.runtime.sendMessage({ type: 'EXTRACT_CONVERSATION' });
    updateStatus(`Extracting conversation with ${username}...`, 'progress');
  });
}

function viewContactDetails(username) {
  // TODO: Implement contact details view
  alert(`Contact details for ${username} - to be implemented`);
}

// Download functions
function downloadMarkdown() {
  chrome.storage.local.get(['markdownContent', 'currentUsername'], (result) => {
    if (result.markdownContent && result.currentUsername) {
      const blob = new Blob([result.markdownContent], { type: 'text/markdown' });
      chrome.downloads.download({
        url: URL.createObjectURL(blob),
        filename: `${result.currentUsername}/conversations/fiverr_conversation_${result.currentUsername}_${new Date().toISOString().split('T')[0]}.md`,
        saveAs: false
      });
    } else {
      updateStatus('No conversation data available to download.', 'error');
    }
  });
}

function viewMarkdown() {
  chrome.storage.local.get(['markdownContent'], (result) => {
    if (result.markdownContent) {
      const blob = new Blob([result.markdownContent], { type: 'text/markdown' });
      chrome.tabs.create({ url: URL.createObjectURL(blob) });
    } else {
      updateStatus('No conversation data available to view.', 'error');
    }
  });
}

function downloadJson() {
  chrome.storage.local.get(['jsonContent', 'currentUsername'], (result) => {
    if (result.jsonContent && result.currentUsername) {
      const blob = new Blob([JSON.stringify(result.jsonContent, null, 2)], { type: 'application/json' });
      chrome.downloads.download({
        url: URL.createObjectURL(blob),
        filename: `${result.currentUsername}/conversations/${result.currentUsername}_conversation.json`,
        saveAs: false
      });
    } else {
      updateStatus('No conversation data available to download.', 'error');
    }
  });
}

function viewJson() {
  chrome.storage.local.get(['jsonContent'], (result) => {
    if (result.jsonContent) {
      const blob = new Blob([JSON.stringify(result.jsonContent, null, 2)], { type: 'application/json' });
      chrome.tabs.create({ url: URL.createObjectURL(blob) });
    } else {
      updateStatus('No conversation data available to view.', 'error');
    }
  });
}

// Attachment functions
function previewAttachment(attachment) {
  // Reuse preview functionality from popup.js
  openPreview(attachment, 'dashboard-user');
}

function downloadAttachment(attachment) {
  chrome.storage.local.get(['currentUsername'], (result) => {
    const username = result.currentUsername || 'unknown';
    chrome.downloads.download({
      url: attachment.downloadUrl,
      filename: `${username}/attachments/${attachment.filename}`,
      saveAs: false
    });
  });
}

// Utility functions
function updateStatus(message, type = 'success') {
  const statusDisplay = document.getElementById('statusDisplay');
  statusDisplay.textContent = message;
  statusDisplay.className = `status-display status-${type}`;
  statusDisplay.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    statusDisplay.style.display = 'none';
  }, 5000);
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp));
  return date.toLocaleString();
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// Status checking (reuse from popup.js)
let statusCheckInterval = null;

function startStatusChecking() {
  if (statusCheckInterval) return;
  
  statusCheckInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_PROCESS_STATUS' }, updateUIWithStatus);
  }, 2000);
}

function updateUIWithStatus(status) {
  const contactsStatus = status?.contacts;
  const conversationStatus = status?.conversations;

  // Update contacts UI
  if (contactsStatus) {
    const contactsButton = document.getElementById('fetchAllContactsBtn');
    const contactsProgress = document.getElementById('contactsProgress');
    
    if (contactsStatus.status === 'running') {
      contactsButton.disabled = true;
      contactsProgress.style.display = 'block';
      document.getElementById('contactsProgressText').textContent = contactsStatus.progress || 'Processing...';
    } else if (contactsStatus.status === 'completed') {
      contactsButton.disabled = false;
      contactsProgress.style.display = 'none';
      loadContacts(); // Refresh contacts display
      loadStatistics(); // Refresh statistics
    }
  }

  // Update conversation UI
  if (conversationStatus) {
    const extractButton = document.getElementById('extractCurrentBtn');
    const extractionProgress = document.getElementById('extractionProgress');
    
    if (conversationStatus.status === 'running') {
      extractButton.disabled = true;
      extractionProgress.style.display = 'block';
      document.getElementById('extractionProgressText').textContent = conversationStatus.progress || 'Processing...';
    } else if (conversationStatus.status === 'completed') {
      extractButton.disabled = false;
      extractionProgress.style.display = 'none';
      loadConversationDisplay(); // Refresh conversation display
      loadAttachments(); // Refresh attachments
      loadStatistics(); // Refresh statistics
    } else if (conversationStatus.status === 'error') {
      extractButton.disabled = false;
      extractionProgress.style.display = 'none';
      updateStatus(`Error: ${conversationStatus.error}`, 'error');
    }
  }
}

// Preview functionality (reuse from popup.js)
let currentPreviewAttachment = null;
let currentPreviewUsername = null;

function openPreview(attachment, username) {
  currentPreviewAttachment = attachment;
  currentPreviewUsername = username;
  
  const previewModal = document.getElementById('previewModal');
  const previewContainer = document.getElementById('previewContainer');
  const previewTitle = document.querySelector('.preview-title');
  
  previewTitle.textContent = attachment.filename;
  previewContainer.innerHTML = '<div class="preview-loading"><div class="spinner"></div>Loading preview...</div>';
  
  // Show modal
  previewModal.style.display = 'block';
  document.getElementById('modalBackdrop').style.display = 'block';
  
  // Load preview based on file type
  loadPreview(attachment);
}

function loadPreview(attachment) {
  const previewContainer = document.getElementById('previewContainer');
  const fileExtension = attachment.filename.split('.').pop().toLowerCase();
  const fileName = attachment.filename;
  
  // Image files
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(fileExtension)) {
    previewContainer.innerHTML = `
      <img src="${attachment.downloadUrl}" 
           alt="${fileName}" 
           class="preview-image"
           onerror="handlePreviewError('Failed to load image')"
           onload="handlePreviewLoad()" 
           style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);" />
    `;
  }
  // PDF files
  else if (fileExtension === 'pdf') {
    previewContainer.innerHTML = `
      <iframe src="${attachment.downloadUrl}#toolbar=0&navpanes=0&scrollbar=1" 
              class="preview-pdf"
              onerror="handlePreviewError('Failed to load PDF')"
              style="width: 100%; height: 500px; border: none; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);"></iframe>
    `;
  }
  // Other file types (simplified for dashboard)
  else {
    previewContainer.innerHTML = `
      <div class="preview-unsupported" style="padding: 40px; text-align: center; color: #666;">
        <div class="file-icon" style="font-size: 48px; margin-bottom: 16px; opacity: 0.6;">📄</div>
        <h4>File Preview Not Available</h4>
        <p>${fileName}</p>
        <p style="color: #666; margin-top: 16px;">Preview is not supported for this file type. You can download the file to view it.</p>
      </div>
    `;
  }
}

function handlePreviewError(message) {
  const previewContainer = document.getElementById('previewContainer');
  previewContainer.innerHTML = `
    <div class="preview-error" style="padding: 40px; text-align: center; color: #c62828;">
      <div class="error-icon" style="font-size: 48px; margin-bottom: 16px;">❌</div>
      <h4>Preview Error</h4>
      <p>${message}</p>
      <p style="color: #666; margin-top: 16px;">You can still download the file to view it.</p>
    </div>
  `;
}

function handlePreviewLoad() {
  console.log('Preview loaded successfully');
}

function closePreview() {
  const previewModal = document.getElementById('previewModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  
  previewModal.style.display = 'none';
  modalBackdrop.style.display = 'none';
  
  currentPreviewAttachment = null;
  currentPreviewUsername = null;
}

function initializePreviewModal() {
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const closePreviewBtn2 = document.getElementById('closePreviewBtn2');
  const downloadFromPreviewBtn = document.getElementById('downloadFromPreviewBtn');
  const modalBackdrop = document.getElementById('modalBackdrop');

  if (closePreviewBtn) closePreviewBtn.addEventListener('click', closePreview);
  if (closePreviewBtn2) closePreviewBtn2.addEventListener('click', closePreview);
  if (modalBackdrop) modalBackdrop.addEventListener('click', closePreview);

  if (downloadFromPreviewBtn) {
    downloadFromPreviewBtn.addEventListener('click', () => {
      if (currentPreviewAttachment && currentPreviewUsername) {
        chrome.downloads.download({
          url: currentPreviewAttachment.downloadUrl,
          filename: `${currentPreviewUsername}/attachments/${currentPreviewAttachment.filename}`,
          saveAs: false
        });
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const previewModal = document.getElementById('previewModal');
      if (previewModal && previewModal.style.display === 'block') {
        closePreview();
      }
    }
  });
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'CONTACTS_PROGRESS':
      updateStatus(request.message, request.isError ? 'error' : 'progress');
      break;
    
    case 'CONTACTS_FETCHED':
      updateStatus(request.message, 'success');
      loadContacts();
      loadStatistics();
      break;
    
    case 'CONVERSATION_EXTRACTED':
      updateStatus(request.message || 'Conversation extracted successfully!', 'success');
      loadConversationDisplay();
      loadAttachments();
      loadStatistics();
      break;
    
    case 'EXTRACTION_ERROR':
      updateStatus(request.error, 'error');
      break;
  }
});

// Cleanup on page unload
window.addEventListener('unload', () => {
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
});
