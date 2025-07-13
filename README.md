
# 🤖 GAG Stock Facebook Bot

A sophisticated Facebook Messenger bot for tracking Grow A Garden stock with VIP features and special item notifications.

## ✨ Features

### 🔔 Regular Features
- Real-time stock tracking via WebSocket
- Automatic notifications for all stock updates
- Weather information integration
- Clean, aesthetic message formatting

### 💎 VIP Features (Admin-only access)
- Special items monitoring: **Godly**, **Advance**, **Basic**, **Master**, **Beanstalk**, **Ember Lily**
- Priority notifications for rare items
- Exclusive access system with approval workflow
- Premium aesthetic notifications

## 🚀 Setup Instructions

### 1. Facebook App Setup
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Create a new app and select "Business" type
3. Add "Messenger" product to your app
4. Create a Facebook Page for your bot
5. Generate a Page Access Token

### 2. Environment Variables
Set up these secrets in Replit:

```bash
PAGE_ACCESS_TOKEN=your_facebook_page_access_token
VERIFY_TOKEN=your_custom_verify_token
ADMIN_USER_ID=your_facebook_user_id
```

### 3. Webhook Configuration
1. In Facebook App settings, set up webhook URL: `https://your-repl-url.replit.dev/webhook`
2. Set Verify Token to match your `VERIFY_TOKEN`
3. Subscribe to `messages` events

### 4. Deploy and Test
1. Click "Deploy" in Replit
2. Test the webhook verification
3. Start chatting with your bot!

## 💬 Bot Commands

### User Commands
- `start` / `help` - Show welcome message and commands
- `track` - Start receiving stock notifications
- `stop` - Stop notifications
- `vip` - Request VIP access

### Admin Commands
- `approve {access-code}` - Approve VIP access requests

## 🔧 VIP Access System

1. User sends `vip` command
2. Bot generates unique access code: `{username}-vip-{random}`
3. Admin receives notification with user details
4. Admin approves with `approve {code}`
5. User receives aesthetic VIP confirmation
6. Special items notifications activated

## 🎯 Special Items Monitored

- **Godly** items
- **Advance** gear
- **Basic** equipment
- **Master** tools
- **Beanstalk** seeds
- **Ember Lily** plants

## 📱 Message Examples

### Welcome Message
```
🌟 ═══════════════════════════════ 🌟
🤖 **WELCOME TO GAG STOCK BOT** 🤖
🌟 ═══════════════════════════════ 🌟
...
```

### VIP Approval
```
🎉 ═══════════════════════════════ 🎉
💎 **VIP ACCESS APPROVED!** 💎
🎉 ═══════════════════════════════ 🎉
...
```

### Special Items Alert
```
🌟 ═══════════════════════════════ 🌟
🎯 **VIP SPECIAL ITEMS ALERT** 🎯
🌟 ═══════════════════════════════ 🌟
...
```

## 🔧 Technical Details

- **Framework**: Express.js
- **WebSocket**: Real-time connection to GAG Stock API
- **Database**: In-memory storage (Map objects)
- **Deployment**: Replit hosting
- **API**: Facebook Graph API v18.0

## 🛠️ Maintenance

The bot automatically:
- Reconnects WebSocket on disconnect
- Handles API rate limits
- Caches messages to prevent duplicates
- Gracefully handles errors

Enjoy your aesthetic GAG Stock tracking experience! 🎮✨
