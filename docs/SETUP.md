# הגדרת סביבה — SETUP

## דרישות מקדימות
- Node.js 18+
- Git

## התקנה מקומית (מחשב חדש / אחרי clone)
```bash
git clone <repo-url>
cd "Nadlan Al Hazman"
npm install
cp .env.example .env
# ערוך את .env עם הפרטים שלך
node index.js
```

## משתני סביבה נדרשים (.env)
| משתנה | תיאור | איפה מקבלים |
|--------|--------|-------------|
| `TELEGRAM_BOT_TOKEN` | טוקן הבוט | @BotFather בטלגרם |
| `NOTIFY_CHAT_ID` | מזהה הצ'אט לקבלת הודעות | @userinfobot בטלגרם |

## deploy ל-Railway
1. `git push origin main`
2. Railway יזהה אוטומטית ויפרוס
3. וודא שמשתני הסביבה מוגדרים ב-Railway dashboard

## בדיקה שהכל עובד
```bash
node test-scraper.js  # סריקת טסט
```
