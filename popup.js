// GROQ API Configuration
// Load config from config.js (create from config.example.js)
let GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE';
let GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Try to load config from external file
if (typeof CONFIG !== 'undefined') {
  GROQ_API_KEY = CONFIG.GROQ_API_KEY || GROQ_API_KEY;
  GROQ_API_URL = CONFIG.GROQ_API_URL || GROQ_API_URL;
}

// Debug: Log API configuration (remove in production)
console.log('GROQ API Key configured:', GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE' ? 'Yes' : 'No');
console.log('GROQ API URL:', GROQ_API_URL);
console.log('CONFIG object available:', typeof CONFIG !== 'undefined');
console.log('Current API Key value:', GROQ_API_KEY);

// Import formatDate function from content.js
async function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp));
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  
  // Get user's preferred format from storage
  return new Promise((resolve) => {
    chrome.storage.local.get(['dateFormat'], function(result) {
      const format = result.dateFormat || 'DD/MM/YYYY';
      
      let dateStr;
      switch(format) {
        case 'MM/DD/YYYY':
          dateStr = `${month}/${day}/${year}`;
          break;
        case 'YYYY/MM/DD':
          dateStr = `${year}/${month}/${day}`;
          break;
        case 'DD-MM-YYYY':
          dateStr = `${day}-${month}-${year}`;
          break;
        default: // DD/MM/YYYY
          dateStr = `${day}/${month}/${year}`;
      }
      
      resolve(`${dateStr}, ${time}`);
    });
  });
}

// Update status message in popup
function updateStatus(message, isError = false, isProgress = false) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status ${isError ? 'error' : isProgress ? 'progress' : 'success'}`;
}

// Format file size
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return 'size unknown';
  if (bytes < 1024) return bytes + ' B';
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  else return (bytes / 1048576).toFixed(1) + ' MB';
}

// Add log entry
function addLogEntry(message, isError = false) {
  const progressLog = document.getElementById('progressLog');
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry${isError ? ' error' : ''}`;
  logEntry.textContent = message;
  progressLog.appendChild(logEntry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Update contact counter
function updateContactCounter(count) {
  const contactCount = document.getElementById('contactCount');
  const contactCountDisplay = document.getElementById('contactCountDisplay');
  const progressCounter = document.getElementById('progressCounter');
  
  if (contactCount) contactCount.textContent = count;
  if (contactCountDisplay) contactCountDisplay.textContent = count;
  
  if (progressCounter) {
    progressCounter.style.display = 'block';
  }
  
  // Update storage with latest count
  chrome.storage.local.set({ lastContactCount: count });
}

// Display attachments in popup
async function displayAttachments(messages) {
  const attachmentsDiv = document.getElementById('attachments');
  attachmentsDiv.innerHTML = '';

  // Get current username from storage
  chrome.storage.local.get(['currentUsername'], async function(result) {
    const username = result.currentUsername;
    
    for (const message of messages) {
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          const attachmentDiv = document.createElement('div');
          attachmentDiv.className = 'attachment-item';
          
          const info = document.createElement('div');
          info.className = 'attachment-info';
          
          // Format the timestamp using the same function
          const timestamp = attachment.created_at ? await formatDate(attachment.created_at) : 'Time unknown';
          
          info.innerHTML = `
            <div class="attachment-name">${attachment.filename} (${formatFileSize(attachment.fileSize)})</div>
            <div class="attachment-time">📅 ${timestamp}</div>
          `;
          
          const buttonsContainer = document.createElement('div');
          buttonsContainer.className = 'attachment-buttons';
          buttonsContainer.style.display = 'flex';
          buttonsContainer.style.gap = '8px';
          buttonsContainer.style.flexDirection = 'column';
          
          const previewBtn = document.createElement('button');
          previewBtn.className = 'download-btn preview-btn';
          previewBtn.textContent = '👁️ Preview';
          previewBtn.onclick = () => {
            openPreview(attachment, username);
          };

          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'download-btn';
          downloadBtn.textContent = '📥 Download';
          downloadBtn.onclick = () => {
            chrome.downloads.download({
              url: attachment.downloadUrl,
              filename: `${username}/attachments/${attachment.filename}`,
              saveAs: false
            });
          };

          buttonsContainer.appendChild(previewBtn);
          buttonsContainer.appendChild(downloadBtn);

          attachmentDiv.appendChild(info);
          attachmentDiv.appendChild(buttonsContainer);
          attachmentsDiv.appendChild(attachmentDiv);
        }
      }
    }
  });
}

// Display contacts in popup
async function displayContacts(contacts) {
  const contactsList = document.getElementById('contactsList');
  if (!contactsList) return;

  contactsList.innerHTML = ''; // Clear existing contacts
  
  if (!contacts || contacts.length === 0) {
    contactsList.innerHTML = '<div class="no-contacts">No contacts found</div>';
    return;
  }

  for (const contact of contacts) {
    const contactDiv = document.createElement('div');
    contactDiv.className = 'contact-item';
    
    const username = contact.username || 'Unknown User';
    const lastMessage = await formatDate(contact.recentMessageDate);
    
    contactDiv.innerHTML = `
      <div class="contact-name">${username}</div>
      <div class="contact-last-message">Last message: ${lastMessage}</div>
    `;
    
    contactDiv.addEventListener('click', () => {
      // Store username and trigger extraction
      chrome.storage.local.set({ currentUsername: username }, () => {
        // Only send message after storage is set
        chrome.runtime.sendMessage({ type: 'EXTRACT_CONVERSATION' });
        updateStatus(`Extracting conversation with ${username}...`, false, true);
      });
    });
    
    contactsList.appendChild(contactDiv);
  }
}

// Function to load stored contacts
function loadStoredContacts() {
  chrome.storage.local.get(['allContacts', 'lastContactsFetch', 'lastContactCount'], function(result) {
    if (result.allContacts && result.allContacts.length > 0) {
      displayContacts(result.allContacts).catch(console.error);
      
      // Use the actual contacts length for the counter
      updateContactCounter(result.allContacts.length);
      
      // Show last fetch time if available
      if (result.lastContactsFetch) {
        const lastFetch = new Date(result.lastContactsFetch).toLocaleString();
        const progressCounter = document.getElementById('progressCounter');
        if (progressCounter) {
          progressCounter.style.display = 'block';
          progressCounter.innerHTML = `Total Contacts: <span id="contactCount">${result.allContacts.length}</span><br>Last updated: ${lastFetch}`;
        }
      }
    }
  });
}

// Function to update last fetch time
function updateLastFetchTime() {
    const progressCounter = document.getElementById('progressCounter');
    if (progressCounter) {
        const lastFetch = new Date().toLocaleString();
        progressCounter.style.display = 'block';
        progressCounter.innerHTML = `Total Contacts: <span id="contactCount">${document.getElementById('contactCount')?.textContent || '0'}</span><br>Last updated: ${lastFetch}`;
    }
}

// Show conversation actions
function showConversationActions(username) {
  const actionsDiv = document.getElementById('conversationActions');
  actionsDiv.style.display = 'block';
}

// Handle conversation extraction success
function handleConversationExtracted(data, message) {
  updateStatus(message || 'Conversation extracted successfully!');
  
  // Extract username from message
  const usernameMatch = message?.match(/Conversation with (.+) extracted successfully!/);
  const username = usernameMatch ? usernameMatch[1] : '';
  
  // Update and show current conversation
  const currentConversationDiv = document.getElementById('currentConversation');
  if (currentConversationDiv && username) {
    currentConversationDiv.textContent = `Conversation with ${username}`;
    currentConversationDiv.style.display = 'block';
    
    // Store current conversation info
    chrome.storage.local.set({ 
      currentConversationUsername: username,
      lastExtractedTime: Date.now()
    });
  }
  
  // Show conversation actions (now collapsible)
  const conversationSection = document.getElementById('conversationSection');
  if (conversationSection) {
    conversationSection.style.display = 'block';
  }

  // Display attachments using the displayAttachments function
  if (data && data.messages) {
    displayAttachments(data.messages).catch(console.error);
  }

  // Show/Hide attachments button based on whether there are attachments
  const viewAttachmentsBtn = document.getElementById('viewAttachmentsBtn');
  if (viewAttachmentsBtn) {
    const totalAttachments = data?.messages?.reduce((total, message) => 
      total + (message.attachments?.length || 0), 0) || 0;

    if (totalAttachments > 0) {
      viewAttachmentsBtn.style.display = 'block';
      viewAttachmentsBtn.onclick = () => {
        const attachmentsDiv = document.getElementById('attachments');
        const isVisible = attachmentsDiv.style.display === 'block';
        attachmentsDiv.style.display = isVisible ? 'none' : 'block';
        viewAttachmentsBtn.textContent = isVisible 
            ? `📎 Attachments (${totalAttachments})` 
            : `📎 Hide Attachments (${totalAttachments})`;
      };
      // Set initial button text with attachment count
      viewAttachmentsBtn.textContent = `📎 Attachments (${totalAttachments})`;
    } else {
      viewAttachmentsBtn.style.display = 'none';
    }
  }

  // Show post-extraction actions
  const postExtractionActions = document.getElementById('postExtractionActions');
  if (postExtractionActions) {
    postExtractionActions.style.display = 'block';
  }

  // Store conversation data for later use
  chrome.storage.local.set({ 
    lastExtractedData: data,
    conversationReady: true
  });
}

// Add status checking functionality
let statusCheckInterval = null;

function updateUIWithStatus(status) {
    const contactsStatus = status?.contacts;
    const conversationStatus = status?.conversations;

    // Update contacts UI
    if (contactsStatus) {
        const contactsButton = document.getElementById('fetchContactsButton');
        const contactsProgress = document.getElementById('contactsProgress');
        
        if (contactsStatus.status === 'running') {
            contactsButton.disabled = true;
            contactsProgress.textContent = contactsStatus.progress || 'Processing...';
            contactsProgress.style.display = 'block';
        } else if (contactsStatus.status === 'completed') {
            contactsButton.disabled = false;
            contactsProgress.textContent = contactsStatus.message || 'Completed!';
            setTimeout(() => {
                contactsProgress.style.display = 'none';
            }, 3000);
        }
    }

    // Update conversation UI
    if (conversationStatus) {
        const extractButton = document.getElementById('extractButton');
        const extractionProgress = document.getElementById('extractionProgress');
        
        if (conversationStatus.status === 'running') {
            extractButton.disabled = true;
            extractionProgress.textContent = conversationStatus.progress || 'Processing...';
            extractionProgress.style.display = 'block';
        } else if (conversationStatus.status === 'completed') {
            extractButton.disabled = false;
            extractionProgress.textContent = conversationStatus.message || 'Completed!';
            setTimeout(() => {
                extractionProgress.style.display = 'none';
            }, 3000);
        } else if (conversationStatus.status === 'error') {
            extractButton.disabled = false;
            extractionProgress.textContent = `Error: ${conversationStatus.error}`;
            extractionProgress.style.display = 'block';
        }
    }
}

function startStatusChecking() {
    if (statusCheckInterval) return;
    
    // Check status immediately
    chrome.runtime.sendMessage({ type: 'GET_PROCESS_STATUS' }, updateUIWithStatus);
    
    // Then check every 2 seconds
    statusCheckInterval = setInterval(() => {
        chrome.runtime.sendMessage({ type: 'GET_PROCESS_STATUS' }, updateUIWithStatus);
    }, 2000);
}

function stopStatusChecking() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

// Settings modal handlers
function initializeSettings() {
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const cancelBtn = document.getElementById('cancelBtn');
  const saveBtn = document.getElementById('saveBtn');
  const dateFormatSelect = document.getElementById('dateFormat');

  // Load saved format and display mode from chrome.storage
  chrome.storage.local.get(['dateFormat', 'displayMode'], function(result) {
    const savedFormat = result.dateFormat || 'DD/MM/YYYY';
    const savedMode = result.displayMode || 'popup';
    
    dateFormatSelect.value = savedFormat;
    document.getElementById('displayMode').value = savedMode;
    
    // Set initial values if not already set
    if (!result.dateFormat) {
      chrome.storage.local.set({ dateFormat: savedFormat });
    }
    if (!result.displayMode) {
      chrome.storage.local.set({ displayMode: savedMode });
    }
  });

  // Show modal
  settingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'block';
    modalBackdrop.style.display = 'block';
  });

  // Hide modal
  function hideModal() {
    settingsModal.style.display = 'none';
    modalBackdrop.style.display = 'none';
  }

  cancelBtn.addEventListener('click', hideModal);
  modalBackdrop.addEventListener('click', hideModal);

  // Convert conversation to markdown
  async function convertToMarkdown(data) {
    // Get the other user's username from the first message
    let otherUsername = '';
    if (data.messages && data.messages.length > 0) {
      const firstMessage = data.messages[0];
      // Get the username that's not the current user
      if (firstMessage.sender === data.username) {
        otherUsername = firstMessage.recipient;
      } else {
        otherUsername = firstMessage.sender;
      }
    }

    let markdown = `# Conversation with ${otherUsername}\n\n`;
    
    // Process messages sequentially to maintain order
    for (const message of data.messages) {
      // Convert Unix timestamp to formatted date using user's preferred format
      const timestamp = await formatDate(message.createdAt);
      const sender = message.sender || 'Unknown';
      
      markdown += `### ${sender} (${timestamp})\n`;
      
      // Show replied-to message if exists
      if (message.repliedToMessage) {
        const repliedMsg = message.repliedToMessage;
        const repliedTime = await formatDate(repliedMsg.createdAt);
        markdown += `> Replying to ${repliedMsg.sender} (${repliedTime}):\n`;
        markdown += `> ${repliedMsg.body.replace(/\n/g, '\n> ')}\n\n`;
      }
      
      // Add message text
      if (message.body) {
        markdown += `${message.body}\n`;
      }
      
      // Add attachments if any
      if (message.attachments && message.attachments.length > 0) {
        markdown += '\n**Attachments:**\n';
        for (const attachment of message.attachments) {
          // Check if attachment has required fields
          if (attachment && typeof attachment === 'object') {
            const fileName = attachment.file_name || attachment.filename || 'Unnamed File';
            const fileSize = attachment.file_size || attachment.fileSize || 0;
            const attachmentTime = attachment.created_at ? ` (uploaded on ${await formatDate(attachment.created_at)})` : '';
            markdown += `- ${fileName} (${formatFileSize(fileSize)})${attachmentTime}\n`;
          } else {
            markdown += `- File attachment (size unknown)\n`;
          }
        }
      }
      
      markdown += '\n---\n\n';
    }
    
    return markdown;
  }

  // Save settings
  saveBtn.addEventListener('click', async () => {
    const newFormat = dateFormatSelect.value;
    const newMode = document.getElementById('displayMode').value;
    chrome.storage.local.set({ dateFormat: newFormat, displayMode: newMode }, async () => {
      // Refresh all displays with new format
      chrome.storage.local.get(['conversationData', 'currentUsername'], async function(result) {
        if (result.conversationData) {
          // Re-process the conversation data with new format
          const processedData = {
            ...result.conversationData,
            messages: await Promise.all(result.conversationData.messages.map(async msg => ({
              ...msg,
              formattedTime: await formatDate(msg.createdAt),
              repliedToMessage: msg.repliedToMessage ? {
                ...msg.repliedToMessage,
                formattedTime: await formatDate(msg.repliedToMessage.createdAt)
              } : null
            })))
          };

          // Generate new markdown with updated format
          const newMarkdown = await convertToMarkdown(processedData);

          // Update storage with new formatted data
          chrome.storage.local.set({
            conversationData: processedData,
            markdownContent: newMarkdown,
            jsonContent: processedData
          }, () => {
            // After storage is updated, refresh the UI
            displayAttachments(processedData.messages);
            
            // Force reload of markdown content if it's currently viewed
            if (result.markdownContent) {
              const blob = new Blob([newMarkdown], { type: 'text/markdown' });
              const existingMarkdownTab = document.querySelector('a[href*="markdown"]');
              if (existingMarkdownTab) {
                existingMarkdownTab.href = URL.createObjectURL(blob);
              }
            }
          });
        }
      });
      
      // Refresh contacts display
      chrome.storage.local.get(['allContacts'], function(result) {
        if (result.allContacts) {
          displayContacts(result.allContacts);
        }
      });

      hideModal();
    });
  });
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  // Initialize connection with background script
  chrome.runtime.sendMessage({ type: 'INIT_POPUP' });

  // Check if we're on a Fiverr page
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const currentUrl = tabs[0].url;
    if (currentUrl.includes('fiverr.com')) {
      updateStatus('Ready to extract Fiverr data.');
      
      // Get any existing conversation data
      chrome.storage.local.get(['conversationData', 'currentUsername'], function(result) {
        if (result.conversationData) {
          if (result.currentUsername) {
            showConversationActions(result.currentUsername);
          }
        }
      });
    } else {
      updateStatus('Please navigate to Fiverr to use this extension.', true);
    }
  });

  // Load current conversation if exists
  chrome.storage.local.get(['currentConversationUsername', 'lastExtractedTime', 'conversationReady'], function(result) {
    if (result.currentConversationUsername) {
      const currentConversationDiv = document.getElementById('currentConversation');
      if (currentConversationDiv) {
        currentConversationDiv.textContent = `Conversation with ${result.currentConversationUsername}`;
        currentConversationDiv.style.display = 'block';
        
        // Show conversation actions (now collapsible)
        const conversationSection = document.getElementById('conversationSection');
        if (conversationSection) {
          conversationSection.style.display = 'block';
        }
      }
    }
    
    // Show post-extraction actions if conversation is ready
    if (result.conversationReady) {
      const postExtractionActions = document.getElementById('postExtractionActions');
      if (postExtractionActions) {
        postExtractionActions.style.display = 'block';
      }
    }
  });

  // Fetch Contacts button click handler
  document.getElementById('fetchContactsBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentUrl = tabs[0].url;
      if (!currentUrl.includes('fiverr.com')) {
        updateStatus('Please navigate to Fiverr first.', true);
        return;
      }
      
      // Reset UI
      document.getElementById('progressLog').style.display = 'block';
      document.getElementById('progressLog').innerHTML = '';
      document.getElementById('progressCounter').style.display = 'block';
      document.getElementById('contactCount').textContent = '0';
      
      updateStatus('Fetching all contacts...', false, true);
      chrome.runtime.sendMessage({ type: 'FETCH_ALL_CONTACTS' });
    });
  });

  // Extract button click handler
  document.getElementById('extractBtn').addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const url = tabs[0].url;
      
      // Only allow extraction from specific inbox URL format
      const match = url.match(/^https:\/\/www\.fiverr\.com\/inbox\/([^\/\?]+)$/);
      if (!match) {
        updateStatus('Please open a specific inbox URL (e.g., https://www.fiverr.com/inbox/username)', true);
        return;
      }

      const username = match[1];
      // First ensure we have a date format set
      chrome.storage.local.get(['dateFormat'], function(result) {
        const format = result.dateFormat || 'DD/MM/YYYY';
        // Set format if not already set
        chrome.storage.local.set({ 
          dateFormat: format,
          currentUsername: username 
        }, () => {
          // Only send message after storage is set
          chrome.runtime.sendMessage({ type: 'EXTRACT_CONVERSATION' });
          updateStatus(`Extracting conversation with ${username}...`, false, true);
        });
      });
    });
  });

  // Download button click handler
  document.getElementById('downloadBtn').addEventListener('click', () => {
    chrome.storage.local.get(['markdownContent', 'currentUsername'], function(result) {
      if (result.markdownContent && result.currentUsername) {
        const blob = new Blob([result.markdownContent], { type: 'text/markdown' });
        chrome.downloads.download({
          url: URL.createObjectURL(blob),
          filename: `${result.currentUsername}/conversations/fiverr_conversation_${result.currentUsername}_${new Date().toISOString().split('T')[0]}.md`,
          saveAs: false
        });
      } else {
        updateStatus('Please extract the conversation first.', true);
      }
    });
  });

  // Open in new tab button click handler
  document.getElementById('openBtn').addEventListener('click', () => {
    chrome.storage.local.get(['markdownContent'], function(result) {
      if (result.markdownContent) {
        const blob = new Blob([result.markdownContent], { type: 'text/markdown' });
        chrome.tabs.create({ url: URL.createObjectURL(blob) });
      } else {
        updateStatus('Please extract the conversation first.', true);
      }
    });
  });

  // Download JSON button click handler
  document.getElementById('downloadJsonBtn').addEventListener('click', () => {
    chrome.storage.local.get(['jsonContent', 'currentUsername'], function(result) {
      if (result.jsonContent && result.currentUsername) {
        const blob = new Blob([JSON.stringify(result.jsonContent, null, 2)], { type: 'application/json' });
        chrome.downloads.download({
          url: URL.createObjectURL(blob),
          filename: `${result.currentUsername}/conversations/${result.currentUsername}_conversation.json`,
          saveAs: false
        });
      } else {
        updateStatus('Please extract the conversation first.', true);
      }
    });
  });

  // View JSON button click handler
  document.getElementById('viewJsonBtn').addEventListener('click', () => {
    chrome.storage.local.get(['jsonContent'], function(result) {
      if (result.jsonContent) {
        const blob = new Blob([JSON.stringify(result.jsonContent, null, 2)], { type: 'application/json' });
        chrome.tabs.create({ url: URL.createObjectURL(blob) });
      } else {
        updateStatus('Please extract the conversation first.', true);
      }
    });
  });

  // Load stored contacts when popup opens
  loadStoredContacts();
  
  // Start status checking
  startStatusChecking();
  
  // Initialize attachments button if there's stored conversation data
  chrome.storage.local.get(['conversationData'], function(result) {
    if (result.conversationData) {
      handleConversationExtracted(result.conversationData);
    }
  });

  // Initialize settings
  initializeSettings();
  
  // Initialize preview modal
  initializePreviewModal();
  
  // Initialize dashboard button
  initializeDashboardButton();
  
  // Initialize AI suggestions panel
  initializeAISuggestionsPanel();
  
  // Initialize collapsible sections
  initializeCollapsibleSections();
  
  // Initialize post-extraction actions
  initializePostExtractionActions();
  
  // Check AI configuration
  checkAIConfiguration();
  
  // Initialize tab navigation
  initializeTabNavigation();
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'CONTACTS_PROGRESS':
      updateStatus(request.message, request.isError, true);
      if (request.totalContacts) {
        updateContactCounter(request.totalContacts);
      }
      break;
    
    case 'CONTACTS_FETCHED':
      updateStatus(request.message);
      if (request.data) {
        displayContacts(request.data).catch(console.error);
        updateContactCounter(request.data.length);
        updateLastFetchTime(); // Update the timestamp immediately
      }
      break;
    
    case 'CONVERSATION_EXTRACTED':
      handleConversationExtracted(request.data, request.message);
      break;
    
    case 'EXTRACTION_ERROR':
      updateStatus(request.error, true);
      break;
  }
});

// Preview functionality
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
           onload="handlePreviewLoad()" />
    `;
  }
  // PDF files
  else if (fileExtension === 'pdf') {
    previewContainer.innerHTML = `
      <iframe src="${attachment.downloadUrl}#toolbar=0&navpanes=0&scrollbar=1" 
              class="preview-pdf"
              onerror="handlePreviewError('Failed to load PDF')"></iframe>
    `;
  }
  // 3D model files (GLB, GLTF)
  else if (['glb', 'gltf'].includes(fileExtension)) {
    previewContainer.innerHTML = `
      <div class="preview-3d" id="model-viewer-container">
        <model-viewer 
          src="${attachment.downloadUrl}" 
          alt="${fileName}"
          auto-rotate 
          camera-controls
          style="width: 100%; height: 400px; background-color: #f0f0f0;">
        </model-viewer>
      </div>
      <script type="module" src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"></script>
    `;
  }
  // Text files
  else if (['txt', 'md', 'json', 'xml', 'csv', 'log'].includes(fileExtension)) {
    fetch(attachment.downloadUrl)
      .then(response => response.text())
      .then(text => {
        previewContainer.innerHTML = `
          <div style="text-align: left; max-height: 400px; overflow-y: auto; background: #f8f9fa; padding: 16px; border-radius: 8px; border: 1px solid #e0e0e0;">
            <pre style="margin: 0; white-space: pre-wrap; font-family: 'Courier New', monospace; font-size: 12px;">${escapeHtml(text)}</pre>
          </div>
        `;
      })
      .catch(() => {
        handlePreviewError('Failed to load text file');
      });
  }
  // Audio files
  else if (['mp3', 'wav', 'ogg', 'm4a', 'aac'].includes(fileExtension)) {
    previewContainer.innerHTML = `
      <div class="preview-unsupported">
        <div class="file-icon">🎵</div>
        <h4>Audio File</h4>
        <p>${fileName}</p>
        <audio controls style="margin-top: 16px; width: 100%; max-width: 400px;">
          <source src="${attachment.downloadUrl}" type="audio/${fileExtension}">
          Your browser does not support the audio element.
        </audio>
      </div>
    `;
  }
  // Video files
  else if (['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(fileExtension)) {
    previewContainer.innerHTML = `
      <div class="preview-unsupported">
        <div class="file-icon">🎥</div>
        <h4>Video File</h4>
        <p>${fileName}</p>
        <video controls style="margin-top: 16px; width: 100%; max-width: 500px; max-height: 300px;">
          <source src="${attachment.downloadUrl}" type="video/${fileExtension}">
          Your browser does not support the video element.
        </video>
      </div>
    `;
  }
  // Archive files
  else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileExtension)) {
    previewContainer.innerHTML = `
      <div class="preview-unsupported">
        <div class="file-icon">📦</div>
        <h4>Archive File</h4>
        <p>${fileName}</p>
        <p style="color: #666; margin-top: 16px;">Archive files cannot be previewed. Please download to extract contents.</p>
      </div>
    `;
  }
  // Unsupported files
  else {
    previewContainer.innerHTML = `
      <div class="preview-unsupported">
        <div class="file-icon">📄</div>
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
    <div class="preview-error">
      <div class="error-icon">❌</div>
      <h4>Preview Error</h4>
      <p>${message}</p>
      <p style="color: #666; margin-top: 16px;">You can still download the file to view it.</p>
    </div>
  `;
}

function handlePreviewLoad() {
  // Preview loaded successfully
  console.log('Preview loaded successfully');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function closePreview() {
  const previewModal = document.getElementById('previewModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  
  previewModal.style.display = 'none';
  modalBackdrop.style.display = 'none';
  
  currentPreviewAttachment = null;
  currentPreviewUsername = null;
}

// Initialize preview modal event listeners
function initializePreviewModal() {
  const closePreviewBtn = document.getElementById('closePreviewBtn');
  const closePreviewBtn2 = document.getElementById('closePreviewBtn2');
  const downloadFromPreviewBtn = document.getElementById('downloadFromPreviewBtn');
  const modalBackdrop = document.getElementById('modalBackdrop');

  // Close preview modal
  closePreviewBtn.addEventListener('click', closePreview);
  closePreviewBtn2.addEventListener('click', closePreview);
  
  // Close on backdrop click
  modalBackdrop.addEventListener('click', closePreview);

  // Download from preview
  downloadFromPreviewBtn.addEventListener('click', () => {
    if (currentPreviewAttachment && currentPreviewUsername) {
      chrome.downloads.download({
        url: currentPreviewAttachment.downloadUrl,
        filename: `${currentPreviewUsername}/attachments/${currentPreviewAttachment.filename}`,
        saveAs: false
      });
    }
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const previewModal = document.getElementById('previewModal');
      if (previewModal.style.display === 'block') {
        closePreview();
      }
    }
  });
}

// Initialize dashboard button functionality
function initializeDashboardButton() {
  const openDashboardBtn = document.getElementById('openDashboardBtn');
  
  if (openDashboardBtn) {
    openDashboardBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    });
  }
}

// AI Analysis Functions
async function analyzeConversationWithAI(conversationData) {
  try {
    console.log('Starting AI analysis...');
    console.log('API Key available:', GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE');
    
    if (!GROQ_API_KEY || GROQ_API_KEY === 'YOUR_GROQ_API_KEY_HERE') {
      throw new Error('GROQ API key not configured. Please create config.js from config.example.js and add your API key.');
    }

    const messages = conversationData.messages || [];
    if (messages.length === 0) {
      throw new Error('No messages to analyze');
    }

    console.log(`Analyzing ${messages.length} messages...`);

    // Prepare conversation context for AI
    const conversationText = messages.map(msg => {
      const timestamp = new Date(msg.createdAt).toLocaleString();
      return `${msg.sender} (${timestamp}): ${msg.body || '[No text content]'}`;
    }).join('\n');

    const prompt = `You are a professional communication assistant for Fiverr freelancers. Analyze this conversation and provide comprehensive insights.

Conversation:
${conversationText}

Please provide a comprehensive analysis in JSON format with this structure:
{
  "suggestions": [
    {
      "title": "Brief title for the response",
      "response": "The actual response text",
      "tone": "professional/helpful/empathetic/etc",
      "use_case": "When to use this response"
    }
  ],
  "discussed": [
    {
      "title": "Topic discussed",
      "description": "What was talked about regarding this topic"
    }
  ],
  "todo": [
    {
      "title": "Action item",
      "description": "What needs to be done",
      "priority": "high/medium/low"
    }
  ]
}`;

    console.log('Sending request to GROQ API...');
    
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    console.log('API Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', errorText);
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API Response received:', data);
    
    const aiResponse = data.choices[0].message.content;
    console.log('AI Response content:', aiResponse);
    
    // Parse the JSON response
    let suggestions;
    try {
      suggestions = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.log('Raw AI response:', aiResponse);
      // Try to extract suggestions from the text if JSON parsing fails
      suggestions = extractSuggestionsFromText(aiResponse);
    }
    
    console.log('Parsed AI response:', suggestions);
    
    // Store comprehensive analysis data
    chrome.storage.local.set({
      aiAnalysis: {
        suggestions: suggestions.suggestions || [],
        discussed: suggestions.discussed || [],
        todo: suggestions.todo || []
      }
    });
    
    return suggestions;
    
  } catch (error) {
    console.error('AI Analysis Error:', error);
    updateStatus(`AI Analysis failed: ${error.message}`, 'error');
    
    // Return fallback suggestions
    return [
      {
        title: "Professional Follow-up",
        response: "Thank you for your message. I'll review your requirements and get back to you with a detailed response shortly.",
        tone: "professional",
        use_case: "General acknowledgment"
      },
      {
        title: "Clarification Request",
        response: "I want to make sure I understand your needs correctly. Could you please provide more details about [specific aspect]?",
        tone: "helpful",
        use_case: "When you need more information"
      },
      {
        title: "Solution Proposal",
        response: "Based on your requirements, I can help you with this project. Here's what I propose: [your solution]",
        tone: "confident",
        use_case: "When you have a solution to offer"
      }
    ];
  }
}

// Helper function to extract suggestions from text if JSON parsing fails
function extractSuggestionsFromText(text) {
  const suggestions = [];
  const lines = text.split('\n');
  let currentSuggestion = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line.includes('title') || line.includes('Title')) {
      currentSuggestion.title = line.replace(/['"]/g, '').split(':')[1]?.trim() || 'Suggestion';
    } else if (line.includes('response') || line.includes('Response')) {
      currentSuggestion.response = line.replace(/['"]/g, '').split(':')[1]?.trim() || line;
    } else if (line.includes('tone') || line.includes('Tone')) {
      currentSuggestion.tone = line.replace(/['"]/g, '').split(':')[1]?.trim() || 'professional';
    } else if (line.includes('use_case') || line.includes('Use case')) {
      currentSuggestion.use_case = line.replace(/['"]/g, '').split(':')[1]?.trim() || 'General use';
      suggestions.push({...currentSuggestion});
      currentSuggestion = {};
    }
  }
  
  // If we didn't find structured suggestions, create generic ones from the text
  if (suggestions.length === 0) {
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 20);
    paragraphs.slice(0, 3).forEach((paragraph, index) => {
      suggestions.push({
        title: `Suggestion ${index + 1}`,
        response: paragraph.trim(),
        tone: 'professional',
        use_case: 'Based on conversation context'
      });
    });
  }
  
  return { suggestions };
}

function displayAISuggestions(aiResponse) {
  // Handle both old format (array of suggestions) and new format (comprehensive object)
  const suggestions = aiResponse.suggestions || aiResponse;
  const suggestionsContainer = document.getElementById('aiSuggestions');
  const suggestionsPanel = document.getElementById('aiSuggestionsPanel');
  
  if (!suggestions || suggestions.length === 0) {
    suggestionsContainer.innerHTML = '<div class="loading-suggestions">No suggestions available</div>';
    return;
  }

  suggestionsContainer.innerHTML = suggestions.map((suggestion, index) => `
    <div class="suggestion-item" onclick="copySuggestion('${suggestion.response.replace(/'/g, "\\'")}')">
      <div class="suggestion-title">${suggestion.title}</div>
      <div class="suggestion-text">${suggestion.response}</div>
      <div class="suggestion-meta" style="font-size: 10px; color: #666; margin-top: 4px;">
        Tone: ${suggestion.tone} • ${suggestion.use_case}
      </div>
    </div>
  `).join('');

  // Show the suggestions panel
  suggestionsPanel.style.display = 'block';
  
  // Update discussed and todo tabs if data is available
  if (aiResponse.discussed) {
    displayDiscussedTopics(aiResponse.discussed);
  }
  
  if (aiResponse.todo) {
    displayTodoItems(aiResponse.todo);
  }
  
  // Auto-collapse after 10 seconds if not interacted with
  setTimeout(() => {
    if (!suggestionsPanel.classList.contains('user-interacted')) {
      collapseSuggestionsPanel();
    }
  }, 10000);
}

// Display discussed topics
function displayDiscussedTopics(discussed) {
  const discussedContent = document.getElementById('discussedContent');
  
  if (!discussed || discussed.length === 0) {
    discussedContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💬</div>
        <div class="empty-state-title">No Topics Discussed</div>
        <div class="empty-state-description">No specific topics were identified in this conversation</div>
      </div>
    `;
    return;
  }

  discussedContent.innerHTML = discussed.map(topic => `
    <div class="topic-item">
      <div class="topic-title">${topic.title}</div>
      <div class="topic-description">${topic.description}</div>
    </div>
  `).join('');
}

// Display todo items
function displayTodoItems(todo) {
  const todoContent = document.getElementById('todoContent');
  
  if (!todo || todo.length === 0) {
    todoContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">No Action Items</div>
        <div class="empty-state-description">No specific action items were identified from this conversation</div>
      </div>
    `;
    return;
  }

  todoContent.innerHTML = todo.map(item => `
    <div class="todo-item priority-${item.priority || 'medium'}">
      <div class="todo-title">${item.title}</div>
      <div class="todo-description">${item.description}</div>
      <div class="todo-meta">
        <span class="todo-priority ${item.priority || 'medium'}">${(item.priority || 'medium').toUpperCase()}</span>
        <span>Action Required</span>
      </div>
    </div>
  `).join('');
}

function copySuggestion(text) {
  navigator.clipboard.writeText(text).then(() => {
    updateStatus('Response copied to clipboard!', 'success');
    
    // Visual feedback
    event.target.style.background = '#d4edda';
    setTimeout(() => {
      event.target.style.background = '';
    }, 1000);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
    updateStatus('Failed to copy to clipboard', 'error');
  });
}

function toggleSuggestionsPanel() {
  const panel = document.getElementById('aiSuggestionsPanel');
  const toggleBtn = document.getElementById('toggleSuggestions');
  const content = panel.querySelector('.panel-content');
  
  if (content.style.display === 'none') {
    content.style.display = 'block';
    toggleBtn.textContent = '−';
  } else {
    content.style.display = 'none';
    toggleBtn.textContent = '+';
  }
}

function collapseSuggestionsPanel() {
  const panel = document.getElementById('aiSuggestionsPanel');
  const content = panel.querySelector('.panel-content');
  const toggleBtn = document.getElementById('toggleSuggestions');
  
  content.style.display = 'none';
  toggleBtn.textContent = '+';
}

// Collapsible sections functionality
function toggleCollapsible(contentId) {
  const content = document.getElementById(contentId);
  const icon = event.currentTarget.querySelector('.collapsible-icon');
  
  if (content.classList.contains('active')) {
    content.classList.remove('active');
    icon.classList.remove('expanded');
  } else {
    content.classList.add('active');
    icon.classList.add('expanded');
  }
}

// Make toggleCollapsible globally available
window.toggleCollapsible = toggleCollapsible;

// Initialize AI suggestions panel
function initializeAISuggestionsPanel() {
  const toggleBtn = document.getElementById('toggleSuggestions');
  const panel = document.getElementById('aiSuggestionsPanel');
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSuggestionsPanel();
    });
  }
  
  // Mark panel as interacted when user clicks on it
  if (panel) {
    panel.addEventListener('click', () => {
      panel.classList.add('user-interacted');
    });
  }
}

// Initialize collapsible sections
function initializeCollapsibleSections() {
  // Auto-expand contacts section if there are contacts
  chrome.storage.local.get(['allContacts'], (result) => {
    if (result.allContacts && result.allContacts.length > 0) {
      const contactsContent = document.getElementById('contactsContent');
      const contactsHeader = document.querySelector('[onclick*="contactsContent"]');
      if (contactsContent && contactsHeader) {
        contactsContent.classList.add('active');
        contactsHeader.querySelector('.collapsible-icon').classList.add('expanded');
      }
    }
  });
}

// Check AI configuration
function checkAIConfiguration() {
  const isConfigured = GROQ_API_KEY && GROQ_API_KEY !== 'YOUR_GROQ_API_KEY_HERE';
  console.log('AI Configuration Check:', {
    hasApiKey: !!GROQ_API_KEY,
    isConfigured: isConfigured,
    configLoaded: typeof CONFIG !== 'undefined',
    apiKeyValue: GROQ_API_KEY
  });
  
  if (!isConfigured) {
    updateStatus('⚠️ AI not configured. Create config.js with your GROQ API key.', 'error');
  }
  
  return isConfigured;
}

// Initialize tab navigation
function initializeTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;
      
      // Remove active class from all buttons and panels
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanels.forEach(panel => panel.classList.remove('active'));
      
      // Add active class to clicked button and corresponding panel
      button.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
      
      // Load data for the tab if needed
      if (targetTab === 'discussed' || targetTab === 'todo') {
        loadTabData(targetTab);
      }
    });
  });
}

// Load data for specific tabs
function loadTabData(tabName) {
  chrome.storage.local.get(['aiAnalysis'], (result) => {
    if (result.aiAnalysis) {
      if (tabName === 'discussed' && result.aiAnalysis.discussed) {
        displayDiscussedTopics(result.aiAnalysis.discussed);
      } else if (tabName === 'todo' && result.aiAnalysis.todo) {
        displayTodoItems(result.aiAnalysis.todo);
      }
    }
  });
}

// Initialize post-extraction actions
function initializePostExtractionActions() {
  // AI Analysis button
  const analyzeBtn = document.getElementById('analyzeWithAI');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
      chrome.storage.local.get(['lastExtractedData'], async (result) => {
        if (!result.lastExtractedData || !result.lastExtractedData.messages) {
          updateStatus('No conversation data available for analysis.', 'error');
          return;
        }

        updateStatus('Analyzing conversation with AI...', 'progress');
        
        try {
          const suggestions = await analyzeConversationWithAI(result.lastExtractedData);
          displayAISuggestions(suggestions);
          updateStatus('AI analysis complete! Check suggestions below.', 'success');
        } catch (error) {
          console.error('AI Analysis failed:', error);
          updateStatus('AI analysis failed. Please try again.', 'error');
        }
      });
    });
  }

  // Test AI button
  const testAIBtn = document.getElementById('testAI');
  if (testAIBtn) {
    testAIBtn.addEventListener('click', async () => {
      updateStatus('Testing AI connection...', 'progress');
      
      try {
        // Test with a simple conversation
        const testData = {
          messages: [
            {
              sender: "Client",
              body: "Hi, I need help with my project. Can you help me?",
              createdAt: Date.now() - 3600000
            },
            {
              sender: "You",
              body: "Hello! I'd be happy to help. What kind of project are you working on?",
              createdAt: Date.now() - 1800000
            }
          ]
        };
        
        console.log('Testing AI with sample data...');
        const suggestions = await analyzeConversationWithAI(testData);
        
        if (suggestions && suggestions.length > 0) {
          updateStatus('✅ AI connection successful!', 'success');
          displayAISuggestions(suggestions);
        } else {
          updateStatus('❌ AI test failed - no suggestions returned', 'error');
        }
      } catch (error) {
        console.error('AI Test failed:', error);
        updateStatus(`❌ AI test failed: ${error.message}`, 'error');
      }
    });
  }

  // Download Markdown button
  const downloadMarkdownBtn = document.getElementById('downloadMarkdown');
  if (downloadMarkdownBtn) {
    downloadMarkdownBtn.addEventListener('click', () => {
      downloadMarkdown();
    });
  }

  // Download JSON button
  const downloadJsonBtn = document.getElementById('downloadJson');
  if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener('click', () => {
      downloadJson();
    });
  }

  // View Markdown button
  const viewMarkdownBtn = document.getElementById('viewMarkdown');
  if (viewMarkdownBtn) {
    viewMarkdownBtn.addEventListener('click', () => {
      viewMarkdown();
    });
  }

  // View JSON button
  const viewJsonBtn = document.getElementById('viewJson');
  if (viewJsonBtn) {
    viewJsonBtn.addEventListener('click', () => {
      viewJson();
    });
  }
}

// Stop checking when popup closes
window.addEventListener('unload', () => {
  stopStatusChecking();
});
