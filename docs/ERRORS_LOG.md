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

### 10.06.2026 — מייל מ-Railway נכשל (ETIMEDOUT)
**שגיאה:** nodemailer/Gmail → `ETIMEDOUT` על `CONN`
**גורם:** Railway חוסם פורטי SMTP יוצאים (25/465/587)
**פתרון:** מעבר ל-**Brevo HTTP API** (`BREVO_API_KEY`, POST ל-api.brevo.com/v3/smtp/email)
**מניעה:** ב-Railway — לעולם לא SMTP. תמיד HTTP email API.

---

### 10.06.2026 — WhatsApp (Green API) נכשל מ-Railway: 403 → 404
**שגיאות לפי הסדר:** `403 nginx` (host ישן `api.green-api.com` חוסם Railway) → תוקן ל-`7107.api.greenapi.com` → `404` (מזהה אינסטנס היה 11 תווים במקום 10!) → תוקן → `authorized`
**גורם משולב:** (א) דומיין ישן חוסם IP של Railway (ב) תו עודף ב-`GREEN_API_INSTANCE_ID`
**פתרון:** host = `https://{prefix}.api.greenapi.com` + `.trim()` על env + לוודא אורך (instance=10, token=50)
**מניעה:** 403=host/IP · 401=טוקן · 404=instance. תמיד trim + בדיקת אורך.

---

### 11.06.2026 — דיג'סט 19:30: מייל הגיע, WhatsApp לא
**תסמין:** הדיג'סט המתוזמן שלח מייל אך לא WhatsApp (למרות שבדיקת `?wa=1` עם מספר קשיח עבדה)
**גורם:** המספר שמור כ-`+9720507226589` (972+**0**+מספר). `toChatId` השאיר את ה-0 → `9720507226589@c.us` שאינו תקין. `checkWhatsapp` החזיר `existsWhatsapp:false`. ההודעה "נשלחה" בשקט בלי להגיע.
**פתרון:** `toChatId` מנרמל: הסר non-digits → הסר `972` → הסר `^0+` → הוסף `972`
**מניעה:** תמיד לנרמל מספרים ל-Green API ולהסיר 0 מוביל. לאמת עם `checkWhatsapp` לפני האשמת הטוקן/host.

---

### 10.06.2026 — markNotified סימן "נשלח" גם בכישלון
**גורם:** `sendDailyDigest` קרא ל-markNotified אחרי Promise.all ללא בדיקת הצלחה
**פתרון:** ה-notifiers מחזירים boolean; מסמנים רק אם ערוץ אחד הצליח

---

## לקחים כלליים

1. **Chromium על Railway** — תמיד Dockerfile (Debian), לא nixpacks
2. **יד2/מדלן/Green API** — חוסמים IP אמריקאי של Railway → להריץ מ-IP ישראלי (מקומי)
3. **מייל ב-Railway** — SMTP חסום → Brevo HTTP API
4. **Green API host** — `{prefix}.api.greenapi.com` (בלי מקף), לא api.green-api.com
5. **env ב-Railway** — תמיד `.trim()` + בדיקת אורך (הדבקה גוררת תווים עודפים)
6. **Madlan** — GraphQL `api3` עובד מכל IP; אין `__NEXT_DATA__` באתר
7. **סיכום מלא חוצה-פרויקטים:** `Ofek-GitHub/CLAUDE.md` → "לקחים חוצה-פרויקטים"
