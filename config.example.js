// Configuration file for Fiverr Conversation Extractor
// Copy this file to config.js and add your actual API key

const CONFIG = {
  // GROQ API Configuration
  // Get your API key from: https://console.groq.com/keys
  GROQ_API_KEY: 'YOUR_GROQ_API_KEY_HERE',
  
  // GROQ API URL
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  
  // Default model to use for AI analysis
  DEFAULT_MODEL: 'llama-3.1-70b-versatile'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
} else {
  window.CONFIG = CONFIG;
}
