# ארכיטקטורה טכנית — סוכן נדל"ן

## תרשים זרימה כללי
```
[Scheduler/Cron] → [Scrapers] → [Filter Engine] → [Dedup DB] → [Notifier]
```

1. **Scheduler** — כל X דקות מפעיל סריקה
2. **Scrapers** — מודולים נפרדים לכל מקור (yad2.js, madlan.js, telegram.js)
3. **Filter Engine** — בודק כל מודעה מול קריטריוני המשתמש
4. **Dedup DB** — מסד נתונים קטן שמונע שליחת אותה דירה פעמיים
5. **Notifier** — שולח הודעה (WhatsApp / Telegram / Email)

## החלטות ארכיטקטורה

### למה Node.js ולא Python?
תקדים מהסוכן הקודם (ai-personal-agent) בנוי Node.js. עקביות חשובה.

### למה SQLite בהתחלה?
- אפס הגדרה, קובץ אחד
- מספיק לדמו ול-MVP
- מעבר ל-PostgreSQL אם Railway volume נדרש

### מקורות שנשקלו
- **יד2** — HTML סטטי, ניתן לסריקה עם Cheerio (ללא דפדפן מלא)
- **מדלן** — דורש JavaScript rendering → Playwright
- **טלגרם** — API רשמי, הכי נקי
- **פייסבוק** — בעייתי, ראה docs/DECISIONS.md

## תלויות מרכזיות (packages)
| Package | שימוש |
|---------|-------|
| playwright | סריקת אתרים שדורשים JS |
| cheerio | parse HTML פשוט |
| node-cron | scheduler |
| telegraf | Telegram Bot |
| better-sqlite3 | מסד נתונים |
