# יומן שגיאות ידועות — סוכן נדל"ן

## תבנית לרישום שגיאה חדשה
```
### [תאריך] — שם השגיאה
**תיאור:** מה קרה
**סביבה:** local / Railway
**שגיאה מדויקת:**
```
error message here
```
**גורם:** מה גרם לזה
**פתרון:** מה עשינו
**מניעה בעתיד:** איך למנוע
---
```

---

## שגיאות פתורות

### 27.05.2026 — ReferenceError: File is not defined
**תיאור:** האפליקציה קרסה ב-Railway מיד בהפעלה
**סביבה:** Railway (Deploy)
**שגיאה מדויקת:**
```
ReferenceError: File is not defined
at /app/node_modules/undici/lib/web/webidl/index.js:537:48
```
**גורם:** Node.js 18 לא תומך ב-`File` כ-global — axios v1.7+ משתמש ב-undici שדורש Node 20
**פתרון:** הוספת `.node-version` עם ערך `20` + עדכון `engines` ב-package.json ל-`>=20.0.0`
**מניעה בעתיד:** תמיד לציין Node 20+ בפרויקטים חדשים עם axios מודרני

---

---

## שגיאות פתוחות / ידועות

### 27.05.2026 — יד2 מחזירה security challenge מ-Railway
**תיאור:** כל בקשה ל-`www.yad2.co.il` מ-Railway US West מחזירה עמוד "אבטחת אתר"
**סביבה:** Railway (Production)
**גורם:** יד2 חוסמת IP-ים זרים
**סטטוס:** בבדיקה — Puppeteer עם Dockerfile עשוי לעקוף (לא נבדק עד הסוף)
**ראה:** `docs/SCRAPING_STATUS.md` לפירוט מלא

---

### 27.05.2026 — nixpkgs chromium לא תואם puppeteer-core
**תיאור:** nixpacks מתקין `chromium` שיוצר wrapper script ב-`/usr/bin/chromium`, לא binary — puppeteer-core נכשל
**שגיאה:** "Browser was not found at the configured executablePath (/usr/bin/chromium)"
**פתרון:** שימוש ב-Dockerfile עם `node:20-bullseye` + `apt-get install chromium`
**מניעה בעתיד:** לא להשתמש ב-nixpkgs לchromium — תמיד Dockerfile עם Debian

---

## לקחים כלליים

1. **Chromium על Railway** — תמיד Dockerfile (Debian), לא nixpacks
2. **יד2/מדלן HTML scraping** — לא עובד מ-IP זר ללא headless browser
3. **gw.yad2.co.il** — ה-API endpoint שניסינו לא קיים (404)
4. **madlan.co.il/api/graphql** — לא קיים (404)
5. **Madlan** — אין `__NEXT_DATA__`, נטעין ב-JS, דורש headless browser
