# סטטוס סריקות — ניסיונות, מסקנות, ממשיך מפה

_עדכון אחרון: 31.05.2026_

> **➡️ לנקודת ההמשך המלאה והעדכנית ביותר ראה [SESSION_HANDOFF.md](SESSION_HANDOFF.md)**
> שם נמצאים: הארכיטקטורה הסופית, כל הפרטים הטכניים, והמשימות הפתוחות.

---

## סטטוס נוכחי (31.05 — פתרון עובד!)

| מקור | עובד? | הערות |
|------|--------|-------|
| יד2 | ⚠️ עובד אך חסום זמנית | Puppeteer+Chrome מקומי (IP ישראלי), city=2550. ShieldSquare חוסם לסירוגין |
| מדלן | ✅ עובד מלא | GraphQL `api3` מקומי, ללא דפדפן. דירה אמיתית נשמרה |
| טלגרם | ✅ עובד | persistence תוקן |

**פריצת הדרך:** במקום לסרוק מ-Railway (IP אמריקאי חסום), סורקים מהמחשב של אופק
(IP ישראלי) ושולחים ל-Railway דרך `/api/ingest`. מדלן עובד מכל IP דרך GraphQL.

---

## מה ניסינו

### שלב 1 — HTML Scraping ישיר (נכשל)
- ניסינו לגרד `www.yad2.co.il/realestate/rent` עם axios
- **תוצאה:** יד2 מחזירה עמוד "אבטחת אתר | יד2" (HTTP 200 אבל תוכן security challenge)
- יד2 חוסמת בקשות מ-IP של Railway (US West)

### שלב 2 — Yad2 Gateway API (נכשל)
- ניסינו `gw.yad2.co.il/feed-search/realestate/rent`
- **תוצאה:** HTTP 404 — ה-endpoint לא קיים / נחשנו URL שגוי

### שלב 3 — Madlan GraphQL (נכשל)
- ניסינו `madlan.co.il/api/graphql` עם query שהמצאנו
- **תוצאה:** HTTP 404 — אין GraphQL endpoint כזה
- Madlan HTML scraping: HTTP 200 אבל אין `__NEXT_DATA__` — טוענת הכל ב-JS

### שלב 4 — Puppeteer עם nixpacks chromium (נכשל)
- הוספנו `chromium` ל-nixPkgs
- **תוצאה:** `/usr/bin/chromium` נמצא אבל `puppeteer-core` לא הצליח לפתוח אותו
  - שגיאה: "Browser was not found at the configured executablePath"
  - סיבה: nixpkgs יוצר wrapper shell script, לא binary ישיר — puppeteer-core לא תומך בכך

### שלב 5 — `puppeteer` מלא (לא הסתיים)
- החלפנו ל-`puppeteer` (לא core) שמוריד Chrome בעצמו
- Build על Railway לא הסתיים / נכשל — Chrome ~130MB גורם ל-timeout/שגיאה

### שלב 6 — Dockerfile + Debian + apt-get chromium (✅ חלקי)
- כתבנו `Dockerfile` עם `node:20-bullseye` + `apt-get install chromium`
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- **תוצאה:** `/api/chrome-check` מחזיר `launched: true` — Puppeteer **עובד**!
- **לא נבדק:** האם הסריקה בפועל מצליחה (deploy עדיין בבנייה בסוף המפגש)

---

## מסקנות ולקחים

1. **יד2 חוסמת IP זרים** — security challenge page לכל בקשה מ-Railway US West
2. **מדלן לא Next.js רגיל** — אין `__NEXT_DATA__`, נתונים נטענים ב-JS
3. **nixpkgs chromium לא תואם puppeteer-core** — wrapper script vs binary issue
4. **Dockerfile עדיף על nixpacks** לפרויקטים עם Chromium/Puppeteer
5. **Puppeteer עם Dockerfile (Debian) עובד** — confirmed `launched: true`

---

## מה לבדוק בפגישה הבאה

### בדיקה ראשונה — האם יד2 מחזיר נתונים?
```
GET /api/test-tlv
```
אם `count > 0` → הסריקה עובדת, גדרה סתם ריקה/מעטה
אם `count = 0` + error → בעיה בחילוץ ה-data

### אם חילוץ יד2 נכשל — אפשרויות:
1. **Puppeteer stealth לא עוקף את security challenge** → צריך proxy ישראלי (BrightData)
2. **`__NEXT_DATA__` קיים אחרי Puppeteer אבל בנתיב שונה** → debug עם logging מפורט

### אם חילוץ יד2 עובד — לבדוק:
- מדלן: האם API interception עובד?
- גדרה: האם יש בכלל מודעות שם?
- פילטרים: דו משפחתי + ממ"ד + מעלית + חניה בגדרה — אולי קריטריונים צרים מדי

---

## קבצים רלוונטיים

| קובץ | תיאור |
|------|-------|
| `Dockerfile` | הפתרון הנוכחי — Debian + apt chromium |
| `scrapers/puppeteerHelper.js` | helper משותף לפתיחת browser |
| `scrapers/yad2.js` | HTML → Puppeteer fallback |
| `scrapers/madlan.js` | HTML → Puppeteer עם API interception |
| `index.js` | `/api/chrome-check`, `/api/test-tlv`, `/api/debug-scan`, `/api/raw-test` |

---

## מצב ה-Deploy הנוכחי

הDeployment האחרון ב-Railway: `Dockerfile עם Debian+Chromium + endpoint /api/test-tlv`
- Branch: `main`
- Repo: `ofek7pass-arch/Nadlan-Al-Hazman`
- URL: `nadlan-al-hazman-production.up.railway.app`
