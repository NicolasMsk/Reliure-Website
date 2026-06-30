export interface OrderEmailData {
  productTitle: string;
  amount: number;       // euros
  email: string;
  shippingAddress?: any;
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function addressLines(a: any): string {
  if (!a) return '';
  const parts = [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.country].filter(Boolean);
  return parts.map((p: string) => esc(p)).join('<br>');
}

const SHELL = (title: string, body: string, brand = 'Livre de Soie') => `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;background:#f7f3e8;font-family:Georgia,serif;color:#2a1a1f;">
  <div style="max-width:560px;margin:0 auto;background:#f0ead8;border:1px solid rgba(92,15,36,.2);">
    <div style="background:#420a19;color:#f0ead8;padding:24px;text-align:center;">
      <h1 style="margin:0;font-size:22px;letter-spacing:2px;color:#d2bf81;">${esc(brand)}</h1>
      <p style="margin:6px 0 0;font-size:13px;opacity:.85;">${esc(title)}</p>
    </div>
    <div style="padding:24px;line-height:1.6;">${body}</div>
    <div style="padding:16px 24px;border-top:1px solid rgba(92,15,36,.15);font-size:11px;color:#5a4a4f;text-align:center;">${esc(brand)} — atelier de reliure d'art</div>
  </div>
</body></html>`;

export function buildOrderConfirmation(lang: 'fr' | 'en', d: OrderEmailData): { subject: string; html: string } {
  if (lang === 'en') {
    return {
      subject: 'Your order is confirmed — Book of Silk',
      html: SHELL('Order confirmed', `
        <p>Thank you for your order!</p>
        <p><strong>${esc(d.productTitle)}</strong> — €${d.amount.toFixed(2)}</p>
        ${d.shippingAddress ? `<p>Shipping to:<br>${addressLines(d.shippingAddress)}</p>` : ''}
        <p>I will carefully prepare and ship your piece. You'll be notified when it's on its way.</p>`, 'Book of Silk'),
    };
  }
  return {
    subject: 'Votre commande est confirmée — Livre de Soie',
    html: SHELL('Commande confirmée', `
      <p>Merci pour votre commande !</p>
      <p><strong>${esc(d.productTitle)}</strong> — ${d.amount.toFixed(2)} €</p>
      ${d.shippingAddress ? `<p>Livraison à :<br>${addressLines(d.shippingAddress)}</p>` : ''}
      <p>Je prépare votre pièce avec soin et vous préviendrai de son expédition.</p>`),
  };
}

export function buildOrderNotify(d: OrderEmailData): { subject: string; html: string } {
  return {
    subject: `🔔 Nouvelle commande — ${d.productTitle}`,
    html: SHELL('Nouvelle commande', `
      <p>Nouvelle vente :</p>
      <p><strong>${esc(d.productTitle)}</strong> — ${d.amount.toFixed(2)} €</p>
      <p>Client : ${esc(d.email)}</p>
      ${d.shippingAddress ? `<p>Adresse :<br>${addressLines(d.shippingAddress)}</p>` : ''}`),
  };
}
