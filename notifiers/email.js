const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

function buildHtml(apartments) {
  const cards = apartments.map(apt => `
    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;font-family:Arial,sans-serif;">
      ${apt.image_url ? `<img src="${apt.image_url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:12px;">` : ''}
      <h3 style="margin:0 0 8px;color:#1e293b;">${apt.address || 'כתובת לא ידועה'}</h3>
      <p style="margin:0 0 6px;color:#475569;">
        ${apt.rooms ? apt.rooms + ' חדרים' : ''}
        ${apt.size_sqm ? ' | ' + apt.size_sqm + ' מ"ר' : ''}
        | <strong style="color:#2563eb;">${apt.price ? apt.price.toLocaleString('he-IL') + ' ₪' : 'מחיר לא צוין'}</strong>
      </p>
      <p style="margin:0 0 10px;color:#64748b;font-size:13px;">${apt.description?.slice(0, 200) || ''}</p>
      <a href="${apt.url}" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;">עבור למודעה →</a>
      <span style="float:left;color:#94a3b8;font-size:12px;">${apt.source}</span>
    </div>
  `).join('');

  return `
    <div dir="rtl" style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
      <div style="background:#2563eb;color:#fff;padding:20px;border-radius:12px 12px 0 0;text-align:center;">
        <h2 style="margin:0;">🏠 סוכן נדל"ן — סיכום יומי</h2>
        <p style="margin:8px 0 0;opacity:.85;">נמצאו ${apartments.length} דירות מתאימות</p>
      </div>
      <div style="padding:20px;background:#f8fafc;">${cards}</div>
      <div style="padding:12px;background:#e2e8f0;border-radius:0 0 12px 12px;text-align:center;color:#64748b;font-size:12px;">
        נשלח אוטומטית על ידי סוכן נדל"ן חכם
      </div>
    </div>
  `;
}

async function sendDigest(apartments, config) {
  if (!apartments.length) return;
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[email] EMAIL_USER או EMAIL_PASS חסרים ב-.env');
    return;
  }

  const transporter = createTransport();
  const emails = config.notifications?.emails || [];

  await Promise.all(emails.map(to =>
    transporter.sendMail({
      from: `"סוכן נדל"ן" <${process.env.EMAIL_USER}>`,
      to,
      subject: `🏠 ${apartments.length} דירות חדשות מתאימות לחיפוש שלך`,
      html: buildHtml(apartments)
    }).then(() => console.log(`[email] נשלח ל-${to}`))
      .catch(err => console.error(`[email] שגיאה ל-${to}:`, err.message))
  ));
}

module.exports = { sendDigest };
