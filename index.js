
const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

const fs = require('fs');
const path = require('path');

// Storage for sessions and user data
const activeSessions = new Map();
const vipUsers = new Map();
const accessRequests = new Map();
const lastSentCache = new Map();
const globalLastSeen = new Map();
const customSpecialItems = new Map(); // Store custom items per VIP user

// Persistent storage files
const STORAGE_DIR = './storage';
const VIP_USERS_FILE = path.join(STORAGE_DIR, 'vip_users.json');
const ACCESS_REQUESTS_FILE = path.join(STORAGE_DIR, 'access_requests.json');
const CUSTOM_ITEMS_FILE = path.join(STORAGE_DIR, 'custom_items.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Load persistent data
function loadPersistentData() {
  try {
    // Load VIP users
    if (fs.existsSync(VIP_USERS_FILE)) {
      const vipData = JSON.parse(fs.readFileSync(VIP_USERS_FILE, 'utf8'));
      Object.entries(vipData).forEach(([userId, userData]) => {
        vipUsers.set(userId, userData);
      });
      console.log(`📊 Loaded ${vipUsers.size} VIP users`);
    }

    // Load access requests
    if (fs.existsSync(ACCESS_REQUESTS_FILE)) {
      const requestData = JSON.parse(fs.readFileSync(ACCESS_REQUESTS_FILE, 'utf8'));
      Object.entries(requestData).forEach(([code, requestInfo]) => {
        accessRequests.set(code, requestInfo);
      });
      console.log(`📋 Loaded ${accessRequests.size} pending access requests`);
    }

    // Load custom special items
    if (fs.existsSync(CUSTOM_ITEMS_FILE)) {
      const customData = JSON.parse(fs.readFileSync(CUSTOM_ITEMS_FILE, 'utf8'));
      Object.entries(customData).forEach(([userId, items]) => {
        customSpecialItems.set(userId, items);
      });
      console.log(`🎯 Loaded custom items for ${customSpecialItems.size} users`);
    }
  } catch (error) {
    console.error('Error loading persistent data:', error);
  }
}

// Save persistent data
function savePersistentData() {
  try {
    // Save VIP users
    const vipData = Object.fromEntries(vipUsers);
    fs.writeFileSync(VIP_USERS_FILE, JSON.stringify(vipData, null, 2));

    // Save access requests
    const requestData = Object.fromEntries(accessRequests);
    fs.writeFileSync(ACCESS_REQUESTS_FILE, JSON.stringify(requestData, null, 2));

    // Save custom special items
    const customData = Object.fromEntries(customSpecialItems);
    fs.writeFileSync(CUSTOM_ITEMS_FILE, JSON.stringify(customData, null, 2));
  } catch (error) {
    console.error('Error saving persistent data:', error);
  }
}

// Bot configuration
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Auto uptime configuration
let uptimeInterval = null;
const UPTIME_INTERVAL = 14 * 60 * 1000; // 14 minutes

// Detect deployment platform
function detectDeploymentPlatform() {
  if (process.env.REPLIT_DEPLOYMENT) return 'replit';
  if (process.env.RENDER) return 'render';
  if (process.env.VERCEL) return 'vercel';
  if (process.env.HEROKU_APP_NAME) return 'heroku';
  if (process.env.RAILWAY_STATIC_URL) return 'railway';
  if (process.env.NETLIFY) return 'netlify';
  return 'unknown';
}

// Auto uptime function
async function keepAlive() {
  const platform = detectDeploymentPlatform();
  
  try {
    // Get the current URL based on platform
    let baseUrl = '';
    
    if (platform === 'replit') {
      baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    } else if (platform === 'render') {
      baseUrl = process.env.RENDER_EXTERNAL_URL;
    } else if (platform === 'vercel') {
      baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';
    } else if (platform === 'heroku') {
      baseUrl = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    } else if (platform === 'railway') {
      baseUrl = process.env.RAILWAY_STATIC_URL;
    } else {
      // Fallback - try localhost
      baseUrl = `http://localhost:${PORT}`;
    }

    if (baseUrl) {
      const response = await axios.get(`${baseUrl}/`);
      console.log(`🔄 Uptime ping successful on ${platform}: ${response.status}`);
    }
  } catch (error) {
    console.log(`⚠️ Uptime ping failed: ${error.message}`);
  }
}

// Start auto uptime
function startAutoUptime() {
  const platform = detectDeploymentPlatform();
  console.log(`🚀 Auto uptime started for platform: ${platform}`);
  
  // Clear existing interval if any
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
  }
  
  // Set up periodic uptime pings
  uptimeInterval = setInterval(keepAlive, UPTIME_INTERVAL);
  
  // First ping after 1 minute
  setTimeout(keepAlive, 60000);
}

// Special items to monitor
const SPECIAL_ITEMS = ['Godly Sprinkler', 'Advance Sprinkler', 'basic Sprinkler', 'Master Sprinkler', 'beanstalk', 'Ember lily'];

let sharedWebSocket = null;
let keepAliveInterval = null;

// Utility functions
function formatValue(val) {
  if (val >= 1_000_000) return `x${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `x${(val / 1_000).toFixed(1)}K`;
  return `x${val}`;
}

function getPHTime() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

function getTimeAgo(date) {
  const now = getPHTime();
  const diff = now - new Date(date);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hour < 24) return `${hour}h ago`;
  return `${day}d ago`;
}

function generateAccessCode(username) {
  const randomCode = Math.random().toString(36).substring(2, 8);
  return `${username}-vip-${randomCode}`;
}

function cleanText(text) {
  return text.trim().toLowerCase();
}

// Send message function
async function sendMessage(recipientId, messageData) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: messageData
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
  }
}

// Get user profile
async function getUserProfile(userId) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${userId}?fields=first_name,last_name&access_token=${PAGE_ACCESS_TOKEN}`
    );
    return response.data;
  } catch (error) {
    console.error('Error getting user profile:', error.response?.data || error.message);
    return { first_name: 'User', last_name: '' };
  }
}

// WebSocket connection
function ensureWebSocketConnection() {
  if (sharedWebSocket && sharedWebSocket.readyState === WebSocket.OPEN) return;

  sharedWebSocket = new WebSocket("wss://gagstock.gleeze.com");

  sharedWebSocket.on("open", () => {
    console.log("🌐 WebSocket connected to GAG Stock");
    keepAliveInterval = setInterval(() => {
      if (sharedWebSocket.readyState === WebSocket.OPEN) {
        sharedWebSocket.send("ping");
      }
    }, 10000);
  });

  sharedWebSocket.on("message", async (data) => {
    try {
      const payload = JSON.parse(data);
      if (payload.status !== "success" || !payload.data) return;

      const stock = payload.data;
      await processStockUpdate(stock);
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  sharedWebSocket.on("close", () => {
    console.log("🔌 WebSocket disconnected");
    clearInterval(keepAliveInterval);
    sharedWebSocket = null;
    setTimeout(ensureWebSocketConnection, 3000);
  });

  sharedWebSocket.on("error", (error) => {
    console.error('WebSocket error:', error);
    sharedWebSocket?.close();
  });
}

// Process stock updates
async function processStockUpdate(stock) {
  const stockData = {
    gear: stock.gear || { items: [] },
    seed: stock.seed || { items: [] },
    egg: stock.egg || { items: [] },
    cosmetics: stock.cosmetics || { items: [] },
    event: stock.honey || { items: [] },
    travelingmerchant: stock.travelingmerchant || { items: [] }
  };

  // Check for special items for VIP users
  await checkSpecialItems(stockData);

  // Update regular stock notifications
  for (const [senderId, session] of activeSessions.entries()) {
    await sendStockNotification(senderId, stockData);
  }
}

// Check for special items (VIP feature)
async function checkSpecialItems(stockData) {
  for (const [userId, userData] of vipUsers.entries()) {
    if (!userData.active) continue;
    
    const userSpecialItems = [...SPECIAL_ITEMS, ...(customSpecialItems.get(userId) || [])];
    const specialItemsFound = [];
    
    for (const category of Object.values(stockData)) {
      if (category.items) {
        for (const item of category.items) {
          if (item.quantity > 0 && userSpecialItems.some(special => 
            cleanText(item.name).includes(cleanText(special))
          )) {
            specialItemsFound.push(item);
          }
        }
      }
    }

    if (specialItemsFound.length > 0) {
      await sendSpecialItemAlert(userId, specialItemsFound);
    }
  }
}

// Send special item alert to VIP users
async function sendSpecialItemAlert(userId, items) {
  const itemList = items.map(item => 
    `✨ ${item.emoji || '🎯'} **${item.name}** - ${formatValue(item.quantity)}`
  ).join('\n');

  const message = {
    text: `🌟 ═══════════════════════════════ 🌟
🎯 **VIP SPECIAL ITEMS ALERT** 🎯
🌟 ═══════════════════════════════ 🌟

💎 **RARE ITEMS IN STOCK** 💎

${itemList}

⚡ **HURRY! Limited quantities available!** ⚡
🛒 Get them before they're gone!

🌟 ═══════════════════════════════ 🌟
💖 VIP Exclusive Notification 💖
🌟 ═══════════════════════════════ 🌟`
  };

  await sendMessage(userId, message);
}

// Send regular stock notification
async function sendStockNotification(senderId, stockData) {
  try {
    const weather = await axios.get("https://growagardenstock.com/api/stock/weather")
      .then(res => res.data).catch(() => null);

    const weatherInfo = weather
      ? `🌤️ **Weather**: ${weather.icon} ${weather.weatherType}\n📋 ${weather.description}\n🎯 ${weather.cropBonuses}\n\n`
      : "";

    const updatedAt = getPHTime().toLocaleString("en-PH", {
      hour: "numeric", minute: "numeric", second: "numeric",
      hour12: true, day: "2-digit", month: "short", year: "numeric"
    });

    const sections = [];
    
    function addSection(label, section, emoji) {
      const items = Array.isArray(section?.items) ? section.items.filter(i => i.quantity > 0) : [];
      if (items.length === 0) return;
      
      const itemList = items.map(i => 
        `• ${i.emoji || emoji} ${i.name}: ${formatValue(i.quantity)}`
      ).join('\n');
      
      sections.push(`${emoji} **${label}**\n${itemList}${section.countdown ? `\n⏳ Restock: ${section.countdown}` : ""}`);
    }

    addSection("GEAR", stockData.gear, "🛠️");
    addSection("SEEDS", stockData.seed, "🌱");
    addSection("EGGS", stockData.egg, "🥚");
    addSection("COSMETICS", stockData.cosmetics, "🎨");
    addSection("EVENT", stockData.event, "🎉");
    addSection("TRAVELING MERCHANT", stockData.travelingmerchant, "🚚");

    if (sections.length === 0) return;

    const message = {
      text: `🌾 ═══════════════════════════════ 🌾
🎮 **GROW A GARDEN STOCK TRACKER** 🎮
🌾 ═══════════════════════════════ 🌾

${weatherInfo}${sections.join("\n\n")}

📅 **Updated**: ${updatedAt} (PH Time)
🌾 ═══════════════════════════════ 🌾`
    };

    const messageKey = JSON.stringify(message);
    const lastSent = lastSentCache.get(senderId);
    if (lastSent === messageKey) return;

    lastSentCache.set(senderId, messageKey);
    await sendMessage(senderId, message);
  } catch (error) {
    console.error('Error sending stock notification:', error);
  }
}

// Handle incoming messages
async function handleMessage(senderId, messageText) {
  const text = messageText.toLowerCase().trim();
  const userProfile = await getUserProfile(senderId);
  const userName = `${userProfile.first_name} ${userProfile.last_name}`.trim();

  // Admin commands
  if (senderId === ADMIN_USER_ID) {
    if (text.startsWith('approve ')) {
      const accessCode = text.substring(8);
      await handleVipApproval(accessCode);
      return;
    }
  }

  // User commands
  if (text === 'start' || text === 'help') {
    const isVip = vipUsers.has(senderId) && vipUsers.get(senderId).active;
    const vipCommands = isVip ? `
💎 **VIP COMMANDS:**
➕ **add [item]** - Add custom special item
➖ **remove [item]** - Remove custom item
📋 **list** - Show your special items
` : '';

    const helpMessage = {
      text: `🌟 ═══════════════════════════════ 🌟
🤖 **WELCOME TO GAG STOCK BOT** 🤖
🌟 ═══════════════════════════════ 🌟

👋 Hello **${userProfile.first_name}**!

📋 **AVAILABLE COMMANDS:**

🔔 **track** - Start stock notifications
🛑 **stop** - Stop notifications  
💎 **vip** - Request VIP access
🆔 **get-my-id** - Get your user ID
ℹ️ **help** - Show this menu
${vipCommands}
🌟 **VIP FEATURES:**
💎 Special items notifications (Godly, Advance, etc.)
⚡ Priority alerts for rare items
🎯 Custom special items tracking
🛠️ Personalized monitoring

🔄 **AUTO UPTIME:** Bot stays online 24/7
🌍 **PLATFORM:** Auto-detects deployment

🌟 ═══════════════════════════════ 🌟
💖 Enjoy your GAG Stock experience! 💖
🌟 ═══════════════════════════════ 🌟`
    };
    await sendMessage(senderId, helpMessage);
  }
  else if (text === 'track') {
    if (activeSessions.has(senderId)) {
      await sendMessage(senderId, {
        text: "📡 You're already tracking GAG Stock! Use 'stop' to disable notifications."
      });
      return;
    }
    
    activeSessions.set(senderId, { active: true });
    await sendMessage(senderId, {
      text: `✅ **TRACKING ACTIVATED** ✅

🎮 You'll now receive GAG Stock updates!
🔔 Notifications will be sent automatically
📊 Real-time stock monitoring enabled

💡 Type 'stop' to disable notifications
💎 Type 'vip' for premium features`
    });
    
    ensureWebSocketConnection();
  }
  else if (text === 'stop') {
    if (!activeSessions.has(senderId)) {
      await sendMessage(senderId, {
        text: "⚠️ You don't have active tracking enabled."
      });
      return;
    }
    
    activeSessions.delete(senderId);
    lastSentCache.delete(senderId);
    await sendMessage(senderId, {
      text: `🛑 **TRACKING STOPPED** 🛑

📴 Stock notifications disabled
👋 Thanks for using GAG Stock Bot!

💡 Type 'track' to re-enable notifications`
    });
  }
  else if (text === 'get-my-id') {
    // Special command to help users get their user ID for admin setup
    await sendMessage(senderId, {
      text: `🆔 **YOUR USER ID** 🆔

👤 **Your Facebook User ID**: ${senderId}
📝 **Your Name**: ${userName}

🔧 **To make yourself admin:**
1. Go to Replit Secrets
2. Add/Update: ADMIN_USER_ID
3. Set value to: ${senderId}
4. Restart the bot

💡 After setting this up, you'll be able to approve VIP requests!`
    });
  }
  else if (text === 'vip') {
    if (vipUsers.has(senderId) && vipUsers.get(senderId).active) {
      const userCustomItems = customSpecialItems.get(senderId) || [];
      const customItemsList = userCustomItems.length > 0 
        ? userCustomItems.map(item => `• ${item}`).join('\n')
        : '• None added yet';

      await sendMessage(senderId, {
        text: `💎 **YOU'RE ALREADY VIP!** 💎

🌟 Your VIP status is active
⚡ Enjoying special items notifications
🎯 Premium features unlocked

📋 **YOUR CUSTOM SPECIAL ITEMS:**
${customItemsList}

💡 **VIP COMMANDS:**
➕ add [item] - Add custom item
➖ remove [item] - Remove item
📋 list - Show all your items

💖 Thank you for being a VIP member!`
      });
      return;
    }

    const accessCode = generateAccessCode(userProfile.first_name || 'User');
    accessRequests.set(accessCode, { userId: senderId, userName, timestamp: Date.now() });
    savePersistentData(); // Save to persistent storage

    // Send to admin
    await sendMessage(ADMIN_USER_ID, {
      text: `🔑 **VIP ACCESS REQUEST** 🔑

👤 **User**: ${userName}
🆔 **User ID**: ${senderId}
🎯 **Access Code**: ${accessCode}

💬 Reply with: approve ${accessCode}
❌ Or ignore to deny access`
    });

    // Send to user
    await sendMessage(senderId, {
      text: `💎 **VIP ACCESS REQUESTED** 💎

🎯 Your request has been sent to admin
🔑 **Access Code**: ${accessCode}
⏰ Please wait for approval

🌟 **VIP BENEFITS:**
✨ Special items notifications
⚡ Priority alerts for rare items
🎯 Custom special items tracking
🛠️ Personalized monitoring

💌 You'll be notified once approved!`
    });
  }
  else if (text.startsWith('add ')) {
    if (!vipUsers.has(senderId) || !vipUsers.get(senderId).active) {
      await sendMessage(senderId, {
        text: `🔒 **VIP FEATURE REQUIRED** 🔒

💎 This feature is exclusive to VIP members
🎯 Type 'vip' to request access

⭐ VIP members can add custom special items for monitoring!`
      });
      return;
    }

    const itemToAdd = text.substring(4).trim();
    if (!itemToAdd) {
      await sendMessage(senderId, {
        text: `❌ **INVALID FORMAT** ❌

💡 Correct usage: add [item name]
📝 Example: add Rainbow Seed

🎯 The item name should match what appears in the stock!`
      });
      return;
    }

    const userCustomItems = customSpecialItems.get(senderId) || [];
    if (userCustomItems.some(item => cleanText(item) === cleanText(itemToAdd))) {
      await sendMessage(senderId, {
        text: `⚠️ **ITEM ALREADY EXISTS** ⚠️

🎯 "${itemToAdd}" is already in your special items list
📋 Type 'list' to see all your items`
      });
      return;
    }

    userCustomItems.push(itemToAdd);
    customSpecialItems.set(senderId, userCustomItems);
    savePersistentData(); // Save to persistent storage

    await sendMessage(senderId, {
      text: `✅ **ITEM ADDED SUCCESSFULLY** ✅

➕ **Added**: "${itemToAdd}"
🔔 You'll now receive notifications when this item is in stock!

📊 **Total Custom Items**: ${userCustomItems.length}
📋 Type 'list' to see all your special items`
    });
  }
  else if (text.startsWith('remove ')) {
    if (!vipUsers.has(senderId) || !vipUsers.get(senderId).active) {
      await sendMessage(senderId, {
        text: `🔒 **VIP FEATURE REQUIRED** 🔒

💎 This feature is exclusive to VIP members
🎯 Type 'vip' to request access`
      });
      return;
    }

    const itemToRemove = text.substring(7).trim();
    if (!itemToRemove) {
      await sendMessage(senderId, {
        text: `❌ **INVALID FORMAT** ❌

💡 Correct usage: remove [item name]
📝 Example: remove Rainbow Seed`
      });
      return;
    }

    const userCustomItems = customSpecialItems.get(senderId) || [];
    const itemIndex = userCustomItems.findIndex(item => cleanText(item) === cleanText(itemToRemove));
    
    if (itemIndex === -1) {
      await sendMessage(senderId, {
        text: `❌ **ITEM NOT FOUND** ❌

🎯 "${itemToRemove}" is not in your special items list
📋 Type 'list' to see all your items`
      });
      return;
    }

    userCustomItems.splice(itemIndex, 1);
    customSpecialItems.set(senderId, userCustomItems);
    savePersistentData(); // Save to persistent storage

    await sendMessage(senderId, {
      text: `✅ **ITEM REMOVED SUCCESSFULLY** ✅

➖ **Removed**: "${itemToRemove}"
🔕 No more notifications for this item

📊 **Remaining Custom Items**: ${userCustomItems.length}
📋 Type 'list' to see your current items`
    });
  }
  else if (text === 'list') {
    if (!vipUsers.has(senderId) || !vipUsers.get(senderId).active) {
      await sendMessage(senderId, {
        text: `🔒 **VIP FEATURE REQUIRED** 🔒

💎 This feature is exclusive to VIP members
🎯 Type 'vip' to request access`
      });
      return;
    }

    const userCustomItems = customSpecialItems.get(senderId) || [];
    const defaultItemsList = SPECIAL_ITEMS.map(item => `• ${item} (Default)`).join('\n');
    const customItemsList = userCustomItems.length > 0 
      ? userCustomItems.map(item => `• ${item} (Custom)`).join('\n')
      : '• None added yet';

    await sendMessage(senderId, {
      text: `📋 **YOUR SPECIAL ITEMS LIST** 📋

🎯 **DEFAULT SPECIAL ITEMS:**
${defaultItemsList}

✨ **YOUR CUSTOM ITEMS:**
${customItemsList}

📊 **Total**: ${SPECIAL_ITEMS.length + userCustomItems.length} items monitored

💡 **COMMANDS:**
➕ add [item] - Add new item
➖ remove [item] - Remove item`
    });
  }
  else {
    const isVip = vipUsers.has(senderId) && vipUsers.get(senderId).active;
    const vipCommands = isVip ? `
💎 **add [item]** - Add custom special item
➖ **remove [item]** - Remove custom item
📋 **list** - Show your special items` : '';

    await sendMessage(senderId, {
      text: `🤖 **COMMAND NOT RECOGNIZED** 🤖

💡 Available commands:
🔔 **track** - Start notifications
🛑 **stop** - Stop notifications
💎 **vip** - Request VIP access
ℹ️ **help** - Show help menu${vipCommands}

Type 'help' for detailed information!`
    });
  }
}

// Handle VIP approval
async function handleVipApproval(accessCode) {
  const request = accessRequests.get(accessCode);
  if (!request) {
    await sendMessage(ADMIN_USER_ID, {
      text: `❌ **INVALID ACCESS CODE** ❌\n\nCode: ${accessCode} not found or expired.`
    });
    return;
  }

  const { userId, userName } = request;
  vipUsers.set(userId, { active: true, approvedAt: Date.now(), approvedBy: ADMIN_USER_ID });
  accessRequests.delete(accessCode);
  savePersistentData(); // Save to persistent storage

  // Notify admin
  await sendMessage(ADMIN_USER_ID, {
    text: `✅ **VIP ACCESS APPROVED** ✅

👤 **User**: ${userName}
🆔 **User ID**: ${userId}
🎯 **Access Code**: ${accessCode}

💎 User now has VIP privileges!`
  });

  // Notify user with aesthetic message
  await sendMessage(userId, {
    text: `🎉 ═══════════════════════════════ 🎉
💎 **VIP ACCESS APPROVED!** 💎
🎉 ═══════════════════════════════ 🎉

🌟 **CONGRATULATIONS ${userName.toUpperCase()}!** 🌟

💎 You are now a **VIP MEMBER**! 💎

🎯 **EXCLUSIVE BENEFITS UNLOCKED:**
✨ Special Items Notifications (Godly, Advance, Basic, Master, Beanstalk, Ember Lily)
⚡ Priority alerts for rare items
🚀 Lightning-fast notifications
🎮 Premium GAG Stock experience

🔔 **NOTIFICATIONS ACTIVATED**
You'll receive instant alerts when special items are in stock!

🎉 ═══════════════════════════════ 🎉
💖 **WELCOME TO VIP CLUB!** 💖
🎉 ═══════════════════════════════ 🎉`
  });
}

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Webhook for receiving messages
app.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    body.entry.forEach((entry) => {
      const webhookEvent = entry.messaging[0];
      
      if (webhookEvent.message) {
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message.text;
        
        if (messageText) {
          handleMessage(senderId, messageText);
        }
      }
    });

    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  const platform = detectDeploymentPlatform();
  res.json({
    status: 'active',
    message: '🤖 GAG Stock Facebook Bot is running!',
    timestamp: new Date().toISOString(),
    platform: platform,
    uptime: Math.floor(process.uptime()),
    features: {
      stock_tracking: true,
      vip_system: true,
      special_items: SPECIAL_ITEMS,
      active_sessions: activeSessions.size,
      vip_users: vipUsers.size,
      auto_uptime: true
    }
  });
});

// Admin ID endpoint (for getting your user ID)
app.get('/get-admin-id/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const userProfile = await getUserProfile(userId);
    res.json({
      user_id: userId,
      name: `${userProfile.first_name} ${userProfile.last_name}`.trim(),
      message: 'Use this user_id as your ADMIN_USER_ID environment variable'
    });
  } catch (error) {
    res.status(400).json({
      error: 'Invalid user ID or unable to fetch profile',
      message: 'Make sure the user has messaged your bot first'
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  const platform = detectDeploymentPlatform();
  console.log('🚀 ═══════════════════════════════════════');
  console.log('🤖 GAG Stock Facebook Bot Started!');
  console.log('🚀 ═══════════════════════════════════════');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Platform detected: ${platform}`);
  console.log('💎 VIP System: Active');
  console.log('🔔 Special Items Monitoring: Active');
  console.log('🔄 Auto Uptime: Active');
  console.log('🌐 WebSocket: Connecting...');
  console.log('🚀 ═══════════════════════════════════════');
  
  // Load persistent data
  loadPersistentData();
  
  // Initialize WebSocket connection
  ensureWebSocketConnection();
  
  // Start auto uptime system
  startAutoUptime();
});

// Periodic save every 5 minutes
setInterval(savePersistentData, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  savePersistentData(); // Save data before shutdown
  if (sharedWebSocket) {
    sharedWebSocket.close();
  }
  clearInterval(keepAliveInterval);
  if (uptimeInterval) {
    clearInterval(uptimeInterval);
  }
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  savePersistentData(); // Save data before shutdown
  process.exit(0);
});
