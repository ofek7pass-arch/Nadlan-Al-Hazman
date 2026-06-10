# נקודת המשך / סטטוס פרויקט

_עדכון אחרון: 10.06.2026 — **הפרויקט עובד מקצה לקצה ✅**_

---

## TL;DR — הכל עובד

| רכיב | סטטוס |
|------|-------|
| טלגרם persistence | ✅ תוקן |
| מדלן | ✅ עובד מלא (GraphQL) |
| יד2 | ✅ עובד (ShieldSquare מתקרר מעצמו; retry + IP ישראלי) |
| פילטר (נוחויות=בונוס) | ✅ עובד |
| צינור מקומי→Railway | ✅ עובד |
| Task Scheduler | ✅ רץ כל 30 דק' |
| **מייל** | ✅ עובד דרך **Brevo HTTP API** (SMTP חסום ב-Railway) |
| **WhatsApp** | ✅ עובד מ-Railway (Green API, host `greenapi.com`) |
| **צ'ק-בוקס נמענים (אופק/ים)** | ✅ רק מסומנים מקבלים התראות |

### התראות — הפתרונות הסופיים (היו הכי קשים)
- **מייל:** Railway חוסם SMTP → עברנו ל-**Brevo HTTP API**. env: `BREVO_API_KEY`. שולח מ-ofek7pass@gmail.com (מאומת ב-Brevo).
- **WhatsApp:** Green API חוסם דומיין ישן מ-Railway → host חייב להיות `https://7107.api.greenapi.com` (בלי מקף, prefix לפי האינסטנס). env: `GREEN_API_INSTANCE_ID`=`7107617295` (10 ספרות!), `GREEN_API_TOKEN`. הקוד עושה `.trim()`.
- **באג שתוקן:** דירות סומנו "נשלח" גם בכישלון שליחה → עכשיו מסמן רק אם ערוץ אחד הצליח.
- **נמענים:** `config.notifications.recipients[]` = `{name, email, phone, enabled}`. ה-notifiers שולחים רק ל-enabled. UI: צ'ק-בוקסים בעמוד הראשי.

---

## ✅ מה שהיה פתוח — נפתר (10.06.2026)

### 1. יד2 — ShieldSquare → נפתר
ה-cooldown עבד: יום אחרי, יד2 חזר לשלוף 23 מודעות ללא חסימה. הקוד כולל retry x3 + `headless:'new'` + פרופיל קבוע. בקצב רגיל (כל 30 דק') אין חסימה.

### 2. התראות WhatsApp + מייל → נפתרו (ראה "הפתרונות הסופיים" למעלה)
שניהם עובדים end-to-end. אומתו בשליחות בדיקה אמיתיות (מייל ל-ofek7pass, WhatsApp ל-0507226589 מ-Railway).

### endpoints לבדיקה (נשארו בקוד)
- `GET /api/notif-check` — מצב env + Green API state + נמענים (ללא שליחה)
- `POST /api/send-digest?self=1` — בדיקת מייל לאופק בלבד
- `POST /api/send-digest?wa=1` — בדיקת WhatsApp לאופק בלבד מ-Railway

---

## ארכיטקטורה סופית (חשוב להבין לפני שממשיכים)

```
┌─ המחשב של אופק (IP ישראלי) ──────────────┐
│  local-scraper/scraper.js (כל 30 דק')     │
│   ├─ יד2: Puppeteer + Chrome (ShieldSquare)│
│   └─ מדלן: GraphQL api3 (ללא דפדפן)        │
│         │ POST /api/ingest                 │
└─────────┼──────────────────────────────────┘
          ▼
┌─ Railway (nadlan-al-hazman-production) ────┐
│  /api/ingest → filter → SQLite (Volume)    │
│  runScan (cron 10דק'): טלגרם בלבד          │
│  sendDailyDigest (cron 19:30): WhatsApp+מייל│
└─────────────────────────────────────────────┘
```

**למה ככה:** יד2 ומדלן חוסמים IP אמריקאי של Railway. המחשב של אופק עם IP
ישראלי עוקף את זה. Railway נשאר קל — מסנן, שומר, שולח התראות.

---

## פרטים טכניים שחולצו (לא לאבד!)

### יד2
- **קוד עיר גדרה: `city=2550`, `area=52`, slug=`south`**
- URL: `https://www.yad2.co.il/realestate/rent/south?area=52&city=2550&minRooms=X&maxRooms=Y&minPrice=A&maxPrice=B&minSquareMeter=S&maxSquareMeter=L&page=N`
- נתונים ב-`__NEXT_DATA__` → `props.pageProps.feed.{private, agency, platinum, booster, yad1.listingsByTiersMatch}`
- שדות פריט: `price`, `additionalDetails.{roomsCount, squareMeter, property.text}`, `address.{street.text, house.number, city.text}`, `token`, `metaData.coverImage`, `tags[].name`
- pagination: `feed.pagination.{total, totalPages}`
- **חסם:** ShieldSquare (perfdrive.com) — דף "אבטחת אתר". חוסם headless לסירוגין. דורש IP ישראלי + retry.

### מדלן
- **GraphQL: `POST https://www.madlan.co.il/api3`** (ללא דפדפן, עובד מכל IP!)
- query: `searchBulletinWithUserPreferences(searchQuery: SearchBulletinQueryInput!)`
- `searchQuery = { limit:200, offset, userPreferences:{ location:[], attributes:[...] } }`
- attribute format: `{ operator, field, intent, value }`
  - Operators: `EQUAL, RANGE, GREATER_EQ, LESS_EQ, IN, ...`
  - Intent: `MUST, NICE_TO_HAVE, OVERRIDE`
  - דוגמה: `{operator:'RANGE', field:'price', intent:'MUST', value:[3000,8000]}`, וכן `field:'beds'`
- **אין סינון עיר בצד שרת** (field 'city'/'docId' לא נתמך) → מושכים הכל (~21,800) ומסננים לפי `address` בצד לקוח. ~110 דפים של 200.
- שדות Bulletin: `id, price, beds (=חדרים), area (=מ"ר), address, dealType (unitRent/unitBuy), propertyType, buildingType, parking, extendedAmenities{name}, images{imageUrl}, structuredAddress{city,streetName,streetNumber,text}`
- **חשוב:** `images{imageUrl}` (לא `url`!). `extendedAmenities` slugs: elevator, parking, secure-room, mamak, miklat, balcony-areas, garden-areas (חלקם מופיעים על כל המודעות → לא אמינים פרט ל-parking)
- גדרה docId (autocomplete CITY): `"גדרה-ישראל"` (לא שימושי לסינון — נשמר לעתיד)

### פילטר (`filters/filter.js`)
- **חובה:** price, rooms, size_sqm, propertyType, city
- **בונוס (לא דוחה):** amenities → מסומן ב-`apt.matchedAmenities`
- `matchesPropertyType`: בודק אם אחד מהסוגים שנבחרו מופיע; "בית פרטי/קוטג'"→קוטג'. סוג לא ידוע (מדלן ריק) → עובר (לא דוחה).

### קבצים ומיקומים
- Node נייד: `C:\Users\OfekPass\tools\node-v20.19.1-win-x64\node.exe`
- Chrome: `C:\Users\OfekPass\AppData\Local\Google\Chrome\Application\chrome.exe`
- סקריפט מקומי: `local-scraper/{scraper.js, madlan.js, run.bat, package.json}`
- Task Scheduler: שם המשימה `NadlanYad2Scraper`, כל 30 דק', מריץ `run.bat`
- Railway: Dockerfile (Debian+chromium), Volume ב-`/app/data`

### Endpoints ב-Railway
- `GET/POST /api/settings` — הגדרות (config.json ב-Volume)
- `GET /api/results` — 50 דירות אחרונות
- `POST /api/ingest` — קליטת דירות מהסקריפט המקומי (מסנן+שומר)
- `POST /api/scan` — סריקת טלגרם ידנית
- `POST /api/send-digest` — שליחת דיג'סט ידנית (לבדיקה!)

---

## איך מריצים את הסקריפט המקומי ידנית
```
cd "C:\Users\OfekPass\Ofek-GitHub\Nadlan Al Hazman\local-scraper"
"C:\Users\OfekPass\tools\node-v20.19.1-win-x64\node.exe" scraper.js
```

---

## ניקוי/שיפורים אופציונליים לעתיד
- **Dockerfile** עדיין מתקין chromium — מיותר עכשיו (יד2/מדלן לא נסרקים בשרת). אפשר לפשט לבנייה מהירה.
- **scrapers/madlan.js + scrapers/yad2.js + puppeteerHelper.js** בצד השרת — לא בשימוש ב-runScan (רק ב-debug-scan שהוסר). אפשר למחוק.
- **matchedAmenities** מחושב אך לא מוצג ב-UI/דיג'סט — לחווט תצוגה.
